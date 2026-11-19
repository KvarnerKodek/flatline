#!/usr/bin/env node
// Renders a flatline film to an MP4, frame-exact, by seeking the page and capturing each frame.
//   flatline-render --url http://127.0.0.1:5180/ --out film.mp4 [--size 1280x720] [--fps 30] [--from 0] [--to 100] [--crf 17]
import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';
import puppeteer from 'puppeteer-core';

const { values: a } = parseArgs({
  options: {
    url: { type: 'string' }, out: { type: 'string' }, size: { type: 'string', default: '1280x720' },
    fps: { type: 'string', default: '30' }, from: { type: 'string', default: '0' }, to: { type: 'string' },
    crf: { type: 'string', default: '17' }, chrome: { type: 'string', default: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' },
    software: { type: 'boolean', default: false },
  },
});
if (!a.url || !a.out) { console.error('usage: flatline-render --url <page> --out <file.mp4> [--size WxH] [--fps N] [--from s] [--to s] [--crf N]'); process.exit(2); }

const [w, h] = a.size.split('x').map(Number);
const fps = Number(a.fps), from = Number(a.from);
const gpu = a.software ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=metal', '--enable-gpu-rasterization'];
const browser = await puppeteer.launch({ executablePath: a.chrome, headless: 'new', args: [...gpu, '--ignore-gpu-blocklist'], defaultViewport: { width: w, height: h, deviceScaleFactor: 1 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('pageerror', String(e).slice(0, 300)));
const sep = a.url.includes('?') ? '&' : '?';
await page.goto(`${a.url}${sep}still&render&t=${from}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.title === 'ready' && window.__flatline, { timeout: 120000 });
const to = a.to ? Number(a.to) : await page.evaluate(() => window.__flatline.duration);
const n = Math.round((to - from) * fps);
const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', a.crf, '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-map_metadata', '-1', a.out], { stdio: ['pipe', 'inherit', 'inherit'] });
const start = Date.now();
for (let i = 0; i < n; i++) {
  await page.evaluate((t) => window.__flatline.seek(t), from + i / fps);
  const buf = await page.screenshot({ type: 'jpeg', quality: 94 });
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  if (i % 150 === 0) console.log(`frame ${i}/${n} ${((Date.now() - start) / 1000).toFixed(0)}s`);
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await browser.close();
console.log(`done ${a.out} ${((Date.now() - start) / 1000).toFixed(0)}s`);
