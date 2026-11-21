#!/usr/bin/env node
// Measures what a film costs per frame, with an optional regression budget.
//   flatline-perf --url http://127.0.0.1:5180/ [--at 6,20,52] [--size 1280x720] [--frames 20] [--max-ms 16.7] [--max-calls 3000]
// Per instant: cpu ms (JS and submit), frame ms (closed by gl.finish, so it includes the GPU), draw calls, triangles, objects.
// Exits 1 when any instant is over a budget, so it can gate CI.
import { parseArgs } from 'node:util';
import puppeteer from 'puppeteer-core';

const { values: a } = parseArgs({ options: { url: { type: 'string' }, at: { type: 'string' }, size: { type: 'string', default: '1280x720' }, frames: { type: 'string', default: '20' }, 'max-ms': { type: 'string' }, 'max-calls': { type: 'string' }, chrome: { type: 'string', default: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' } } });
if (!a.url) { console.error('usage: flatline-perf --url <page> [--at t,t,..] [--size WxH] [--frames N] [--max-ms N] [--max-calls N]'); process.exit(2); }
const [w, h] = a.size.split('x').map(Number), n = Number(a.frames);
const browser = await puppeteer.launch({ executablePath: a.chrome, headless: 'new', protocolTimeout: 600000, args: ['--use-angle=metal', '--ignore-gpu-blocklist'], defaultViewport: { width: w, height: h, deviceScaleFactor: 1 } });
const page = await browser.newPage();
await page.goto(`${a.url}${a.url.includes('?') ? '&' : '?'}still&render&t=0`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.title === 'ready' && window.__flatline, { timeout: 180000 });
const dur = await page.evaluate(() => window.__flatline.duration);
const at = a.at ? a.at.split(',').map(Number) : [0.05, 0.25, 0.5, 0.75, 0.95].map((f) => +(f * dur).toFixed(1));
let failed = false;
for (const t0 of at) {
  const r = await page.evaluate((t0, n) => {
    const p = window.__flatline, gl = document.getElementById('gl').getContext('webgl2');
    for (let i = 0; i < 4; i++) p.seek(t0 + i * 0.05);
    gl.finish();
    const s = performance.now();
    for (let i = 0; i < n; i++) p.seek(t0 + i * 0.05);
    const cpu = (performance.now() - s) / n;
    gl.finish();
    const frame = (performance.now() - s) / n;
    return { cpu, frame, ...p.stats() };
  }, t0, n);
  const over = (a['max-ms'] && r.frame > Number(a['max-ms'])) || (a['max-calls'] && r.calls > Number(a['max-calls']));
  failed ||= !!over;
  console.log(`t=${String(t0).padEnd(6)} cpu ${r.cpu.toFixed(1)} ms  frame ${r.frame.toFixed(1)} ms (${Math.round(1000 / r.frame)} fps)  calls ${r.calls}  tris ${Math.round(r.triangles / 1000)}k  objects ${r.objects}${over ? '  OVER BUDGET' : ''}`);
}
await browser.close();
process.exit(failed ? 1 : 0);
