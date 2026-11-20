#!/usr/bin/env node
// Captures chosen instants of a flatline film as PNGs and tiles them into one contact sheet for review.
//   flatline-stills --url http://127.0.0.1:5180/ --out stills [--times 0,10,20 | --every 5] [--size 960x540] [--cols 4]
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import puppeteer from 'puppeteer-core';

const { values: a } = parseArgs({
  options: {
    url: { type: 'string' }, cam: { type: 'string' }, out: { type: 'string', default: 'stills' }, times: { type: 'string' }, every: { type: 'string', default: '5' },
    size: { type: 'string', default: '960x540' }, cols: { type: 'string', default: '4' }, sheet: { type: 'string', default: 'sheet.jpg' },
    chrome: { type: 'string', default: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' },
  },
});
if (!a.url) { console.error('usage: flatline-stills --url <page> [--out dir] [--times a,b,c | --every s] [--size WxH] [--cols N]'); process.exit(2); }
const [w, h] = a.size.split('x').map(Number);
const browser = await puppeteer.launch({ executablePath: a.chrome, headless: 'new', args: ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'], defaultViewport: { width: w, height: h, deviceScaleFactor: 1 } });
const page = await browser.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror ${String(e).slice(0, 400)}`));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()} ${m.text().slice(0, 400)}`); });
await page.goto(`${a.url}${a.url.includes('?') ? '&' : '?'}still&render&t=0${a.cam ? `&cam=${a.cam}` : ''}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.title === 'ready' && window.__flatline, { timeout: 120000 }).catch(() => {});
if (!(await page.evaluate(() => !!window.__flatline))) { console.error(['the film did not start', ...problems].join('\n')); await browser.close(); process.exit(1); }
await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
const dur = await page.evaluate(() => window.__flatline.duration);
const times = a.times ? a.times.split(',').map(Number) : Array.from({ length: Math.floor(dur / Number(a.every)) + 1 }, (_, i) => i * Number(a.every));
mkdirSync(a.out, { recursive: true });
const files = [];
for (const [i, t] of times.entries()) {
  await page.evaluate((x) => {
    window.__flatline.seek(x);
    let l = document.getElementById('still-time');
    if (!l) { l = document.createElement('div'); l.id = 'still-time'; l.style.cssText = 'position:fixed;left:8px;top:8px;z-index:9;font:600 15px ui-monospace,Menlo,monospace;color:#fff;background:rgba(0,0,0,.6);padding:2px 7px'; document.body.append(l); }
    l.textContent = `${x.toFixed(1)}s`;
  }, t);
  const f = join(a.out, `s${String(i).padStart(3, '0')}_${t.toFixed(2)}.png`);
  writeFileSync(f, await page.screenshot({ type: 'png' }));
  files.push(f);
}
await browser.close();
const cols = Math.min(Number(a.cols), files.length), rows = Math.ceil(files.length / cols);
if (files.length === 1) execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', files[0], '-q:v', '3', join(a.out, a.sheet)]);
else execFileSync('ffmpeg', ['-v', 'error', '-y', ...files.flatMap((f) => ['-i', f]), '-filter_complex', `${times.map((_, i) => `[${i}:v]`).join('')}xstack=inputs=${files.length}:layout=${files.map((_, i) => `${(i % cols) * w}_${Math.floor(i / cols) * h}`).join('|')}:fill=black`, '-frames:v', '1', '-q:v', '3', join(a.out, a.sheet)]);
console.log(`${files.length} stills, ${cols}x${rows} sheet at ${join(a.out, a.sheet)}`);
for (const p of [...new Set(problems)]) console.log(p);
