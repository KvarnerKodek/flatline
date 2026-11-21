#!/usr/bin/env node
// Captures many instants at many sizes in one browser session; writes PNGs, a contact sheet per size and a JSON manifest.
//   flatline-stills --url http://127.0.0.1:5180/ --out stills [--times 0,10,20 | --every 5] [--sizes 960x540,320x180] [--cols 4] [--manifest manifest.json]
// A batch spec can come as JSON on --spec file ({ times, sizes, cam, cols }) or stdin with --spec -.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { CHROME, json, openFilm, parseSize } from './lib.mjs';

const { values: a } = parseArgs({
  options: {
    url: { type: 'string' }, cam: { type: 'string' }, out: { type: 'string', default: 'stills' }, times: { type: 'string' }, every: { type: 'string', default: '5' },
    size: { type: 'string' }, sizes: { type: 'string' }, cols: { type: 'string', default: '4' }, sheet: { type: 'string', default: 'sheet.jpg' }, manifest: { type: 'string', default: 'manifest.json' },
    spec: { type: 'string' }, chrome: { type: 'string', default: CHROME },
  },
});
if (!a.url) { console.error('usage: flatline-stills --url <page> [--out dir] [--times a,b,c | --every s] [--sizes WxH,WxH] [--cols N] [--spec file|-]'); process.exit(2); }
const spec = a.spec ? JSON.parse(readFileSync(a.spec === '-' ? 0 : a.spec, 'utf8')) : {};
const sizes = spec.sizes ?? (a.sizes ?? a.size ?? '960x540').split(',');
const cam = spec.cam ?? a.cam, cols0 = Number(spec.cols ?? a.cols);
const { browser, page, problems } = await openFilm({ url: a.url, size: sizes[0], chrome: a.chrome, cam }).catch((e) => { console.error(e.message); process.exit(1); });
const dur = await page.evaluate(() => window.__flatline.duration);
const times = (spec.times ?? (a.times ? a.times.split(',') : Array.from({ length: Math.floor(dur / Number(a.every)) + 1 }, (_, i) => i * Number(a.every)))).map(Number);
const tag = (x) => page.evaluate((x) => {
  let l = document.getElementById('still-time');
  if (!l) { l = document.createElement('div'); l.id = 'still-time'; l.style.cssText = 'position:fixed;left:8px;top:8px;z-index:9;font:600 15px ui-monospace,Menlo,monospace;color:#fff;background:rgba(0,0,0,.6);padding:2px 7px'; document.body.append(l); }
  l.textContent = `${x.toFixed(1)}s`;
}, x);
const manifest = { url: a.url, duration: dur, times, sizes: [], stills: [] };
for (const size of sizes) {
  const [w, h] = parseSize(size);
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  const dir = join(a.out, size);
  mkdirSync(dir, { recursive: true });
  const files = [];
  for (const [i, t] of times.entries()) {
    await page.evaluate((x) => window.__flatline.seek(x), t);
    await tag(t);
    const f = join(dir, `s${String(i).padStart(3, '0')}_${t.toFixed(2)}.png`);
    const buf = await page.screenshot({ type: 'png' });
    writeFileSync(f, buf);
    files.push(f);
    manifest.stills.push({ t, size, file: f, sha1: createHash('sha1').update(buf).digest('hex') });
  }
  const cols = Math.min(cols0, files.length), sheet = join(dir, a.sheet);
  const layout = files.map((_, i) => `${(i % cols) * w}_${Math.floor(i / cols) * h}`).join('|');
  if (files.length === 1) execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', files[0], '-q:v', '3', sheet]);
  else execFileSync('ffmpeg', ['-v', 'error', '-y', ...files.flatMap((f) => ['-i', f]), '-filter_complex', `${files.map((_, i) => `[${i}:v]`).join('')}xstack=inputs=${files.length}:layout=${layout}:fill=black`, '-frames:v', '1', '-q:v', '3', sheet]);
  manifest.sizes.push({ size, sheet, cols, rows: Math.ceil(files.length / cols) });
}
await browser.close();
manifest.problems = [...new Set(problems)];
writeFileSync(join(a.out, a.manifest), JSON.stringify(manifest, null, 1));
json({ manifest: join(a.out, a.manifest), stills: manifest.stills.length, sheets: manifest.sizes.map((s) => s.sheet), problems: manifest.problems });
