#!/usr/bin/env node
// Audits a flatline film the way a viewer would, before you render or ship it.
//   flatline-check --url http://127.0.0.1:5180/ [--fps 4] [--size 480x270] [--top 10]
// 1. Purity: the same instant must look identical however it is reached (seek order must not matter).
// 2. Jumps: lists the biggest frame-to-frame changes so unplanned hard cuts and pops stand out.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import puppeteer from 'puppeteer-core';

const { values: a } = parseArgs({ options: { url: { type: 'string' }, fps: { type: 'string', default: '4' }, size: { type: 'string', default: '480x270' }, top: { type: 'string', default: '10' }, chrome: { type: 'string', default: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' } } });
if (!a.url) { console.error('usage: flatline-check --url <page> [--fps N] [--size WxH] [--top N]'); process.exit(2); }
const [w, h] = a.size.split('x').map(Number), fps = Number(a.fps);
const browser = await puppeteer.launch({ executablePath: a.chrome, headless: 'new', args: ['--use-angle=metal', '--ignore-gpu-blocklist'], defaultViewport: { width: w, height: h, deviceScaleFactor: 1 } });
const page = await browser.newPage();
await page.goto(`${a.url}${a.url.includes('?') ? '&' : '?'}still&render&t=0`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.title === 'ready' && window.__flatline, { timeout: 120000 });
await page.evaluate(() => { performance.now = () => 1000; });
const dur = await page.evaluate(() => window.__flatline.duration);
const dir = mkdtempSync(join(tmpdir(), 'flatline-check-'));
const shot = async (t) => { await page.evaluate((x) => window.__flatline.seek(x), t); return page.screenshot({ type: 'png' }); };
const probe = [0.1, 0.25, 0.5, 0.75, 0.95].map((f) => f * dur);
const first = new Map();
for (const t of probe) first.set(t, createHash('md5').update(await shot(t)).digest('hex'));
const bad = [];
for (const t of [...probe].reverse()) if (createHash('md5').update(await shot(t)).digest('hex') !== first.get(t)) bad.push(t.toFixed(1));
console.log(bad.length ? `PURITY FAIL at t = ${bad.join(', ')} s` : 'purity ok: seek order does not change the picture');
const n = Math.floor(dur * fps);
for (let i = 0; i <= n; i++) writeFileSync(join(dir, `f${String(i).padStart(5, '0')}.png`), await shot(i / fps));
const stats = join(dir, 'stats.txt');
execFileSync('ffmpeg', ['-v', 'error', '-framerate', String(fps), '-i', join(dir, 'f%05d.png'), '-vf', `tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=${stats}`, '-f', 'null', '-']);
const rows = []; let cur = 0;
for (const l of readFileSync(stats, 'utf8').split('\n')) {
  const m = l.match(/pts_time:([\d.]+)/); if (m) cur = Number(m[1]);
  const y = l.match(/YAVG=([\d.]+)/); if (y) rows.push([cur, Number(y[1])]);
}
rows.sort((p, q) => q[1] - p[1]);
console.log(`biggest frame-to-frame changes (t s, mean difference), frames kept in ${dir}`);
for (const [t, y] of rows.slice(0, Number(a.top))) console.log(`${t.toFixed(2).padStart(7)}  ${y.toFixed(1)}`);
await browser.close();
