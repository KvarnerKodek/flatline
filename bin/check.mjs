#!/usr/bin/env node
// Audits a flatline film the way a viewer would, before you render or ship it. Prints one JSON object; exit 1 on a purity failure.
//   flatline-check --url http://127.0.0.1:5180/ [--fps 4] [--size 480x270] [--top 10] [--shards 1]
// 1. Purity: the same instant must look identical however it is reached (seek order must not matter).
// 2. Jumps: the biggest frame-to-frame changes, so unplanned hard cuts and pops stand out.
// CSS transitions and animations are frozen so only film-time effects are compared. --shards N captures the frames in N browsers.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { CHROME, P, captureShards, json, openFilm, shoot } from './lib.mjs';

const { values: a } = parseArgs({ options: { url: { type: 'string' }, fps: { type: 'string', default: '4' }, size: { type: 'string', default: '480x270' }, top: { type: 'string', default: '10' }, shards: { type: 'string', default: '1' }, chrome: { type: 'string', default: CHROME } } });
if (!a.url) { console.error('usage: flatline-check --url <page> [--fps N] [--size WxH] [--top N] [--shards N]'); process.exit(2); }
const fps = Number(a.fps), film = { url: a.url, size: a.size, chrome: a.chrome };
const { browser, page } = await openFilm(film).catch((e) => { console.error(e.message); process.exit(1); });
await page.evaluate(() => { performance.now = () => 1000; });
const dur = await page.evaluate(() => window.__flatline.duration);
const md5 = async (t) => createHash('md5').update(await shoot(page, t)).digest('hex');
const probe = [0.1, 0.25, 0.5, 0.75, 0.95].map((f) => f * dur);
const first = new Map();
for (const t of probe) first.set(t, await md5(t));
const bad = [];
for (const t of [...probe].reverse()) if ((await md5(t)) !== first.get(t)) bad.push(Number(t.toFixed(1)));
await browser.close();
const dir = mkdtempSync(join(tmpdir(), 'flatline-check-'));
const n = Math.floor(dur * fps) + 1;
await captureShards({ ...film, n, shards: Number(a.shards), dir, timeOf: (i) => P.frameTime({ from: 0, fps, i }) });
const stats = join(dir, 'stats.txt');
execFileSync('ffmpeg', ['-v', 'error', '-framerate', String(fps), '-i', join(dir, 'f%06d.png'), '-vf', `tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=${stats}`, '-f', 'null', '-']);
const rows = []; let cur = 0;
for (const l of readFileSync(stats, 'utf8').split('\n')) {
  const m = l.match(/pts_time:([\d.]+)/); if (m) cur = Number(m[1]);
  const y = l.match(/YAVG=([\d.]+)/); if (y) rows.push({ t: cur, diff: Number(y[1]) });
}
const jumps = rows.sort((p, q) => q.diff - p.diff).slice(0, Number(a.top));
json({ purity: { ok: !bad.length, badTimes: bad }, jumps, frames: dir });
process.exit(bad.length ? 1 : 0);
