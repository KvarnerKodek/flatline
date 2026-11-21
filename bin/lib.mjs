// Shared by the flatline tools: open a film in headless Chrome and capture frames.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

// parallel.ts is plain TypeScript; make sure Node can import it.
if (!process.features.typescript && !process.env.FL_STRIP) {
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--disable-warning=ExperimentalWarning', ...process.argv.slice(1)], { stdio: 'inherit', env: { ...process.env, FL_STRIP: '1' } });
  process.exit(r.status ?? 1);
}
export const P = await import('../src/parallel.ts');

export const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const parseSize = (s) => s.split('x').map(Number);
export const json = (o) => console.log(JSON.stringify(o));

/** Opens `url` as a still-mode film at `size` and resolves once it is ready; `problems` collects page errors. */
export const openFilm = async ({ url, size = '1280x720', chrome = CHROME, software = false, t = 0, cam }) => {
  const [width, height] = parseSize(size);
  const gpu = software ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=metal', '--enable-gpu-rasterization'];
  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', protocolTimeout: 300000, args: [...gpu, '--ignore-gpu-blocklist'], defaultViewport: { width, height, deviceScaleFactor: 1 } });
  const page = await browser.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(`pageerror ${String(e).slice(0, 400)}`));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()} ${m.text().slice(0, 400)}`); });
  await page.goto(`${url}${url.includes('?') ? '&' : '?'}still&render&t=${t}${cam ? `&cam=${cam}` : ''}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.title === 'ready' && window.__flatline, { timeout: 120000 }).catch(() => {});
  const started = await page.evaluate(() => !!window.__flatline);
  if (!started) { await browser.close(); throw new Error(['the film did not start', ...problems].join('\n')); }
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
  return { browser, page, problems };
};

/** Seeks to `t` and screenshots; survives a hot reload mid-capture by waiting for the film to come back. */
export const shoot = async (page, t, opts = { type: 'png' }, tries = 5) => {
  try {
    await page.evaluate((x) => window.__flatline.seek(x), t);
    return await page.screenshot(opts);
  } catch (e) {
    if (tries <= 1 || !/context was destroyed|detached|reading .seek.|timed out/.test(String(e))) throw e;
    await page.waitForFunction(() => document.title === 'ready' && window.__flatline, { timeout: 120000 });
    return shoot(page, t, opts, tries - 1);
  }
};

/** Captures `n` frames with `shards` browsers, each owning a contiguous range, as `dir/f%06d.<ext>`; returns the sha1 of every frame in order. */
export const captureShards = async ({ n, shards, dir, ext = 'png', timeOf, shot = { type: 'png' }, ...film }) => {
  const hashes = new Array(n);
  const plan = P.planShards(n, shards);
  const problems = [];
  await Promise.all(plan.map(async ({ start, end }) => {
    const { browser, page, problems: pr } = await openFilm({ ...film, t: timeOf(start) });
    for (let i = start; i < end; i++) {
      const buf = await shoot(page, timeOf(i), shot);
      writeFileSync(join(dir, `f${String(i).padStart(6, '0')}.${ext}`), buf);
      hashes[i] = createHash('sha1').update(buf).digest('hex');
    }
    problems.push(...pr);
    await browser.close();
  }));
  return { hashes, shards: plan.length, problems: [...new Set(problems)] };
};

export const filmDuration = async (film) => {
  const { browser, page } = await openFilm(film);
  const d = await page.evaluate(() => window.__flatline.duration);
  await browser.close();
  return d;
};
