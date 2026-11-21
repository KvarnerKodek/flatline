#!/usr/bin/env node
// Renders a flatline film to an MP4, frame-exact, by seeking the page and capturing each frame.
//   flatline-render --url http://127.0.0.1:5180/ --out film.mp4 [--size 1280x720] [--fps 30] [--from 0] [--to 100] [--crf 17] [--shards 4]
// --shards N renders contiguous frame ranges in N browsers, then encodes the frames in order: the same frames
// through the same encoder as a serial render, so the file is identical. The last line is a JSON summary.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { CHROME, P, captureShards, json, openFilm, shoot } from './lib.mjs';

const { values: a } = parseArgs({
  options: {
    url: { type: 'string' }, out: { type: 'string' }, size: { type: 'string', default: '1280x720' },
    fps: { type: 'string', default: '30' }, from: { type: 'string', default: '0' }, to: { type: 'string' },
    crf: { type: 'string', default: '17' }, chrome: { type: 'string', default: CHROME },
    software: { type: 'boolean', default: false }, shards: { type: 'string', default: '1' },
  },
});
if (!a.url || !a.out) { console.error('usage: flatline-render --url <page> --out <file.mp4> [--size WxH] [--fps N] [--from s] [--to s] [--crf N] [--shards N]'); process.exit(2); }

const fps = Number(a.fps), from = Number(a.from), shards = Math.max(1, Number(a.shards));
const film = { url: a.url, size: a.size, chrome: a.chrome, software: a.software };
const jpeg = { type: 'jpeg', quality: 94 };
const timeOf = (i) => P.frameTime({ from, fps, i });
const first = await openFilm({ ...film, t: from }).catch((e) => { console.error(e.message); process.exit(1); });
const { page } = first;
page.on('pageerror', (e) => console.error('pageerror', String(e).slice(0, 300)));
const to = a.to ? Number(a.to) : await page.evaluate(() => window.__flatline.duration);
const n = Math.round((to - from) * fps);
const b64 = await page.evaluate(() => window.__flatline.wav?.());
const dir = mkdtempSync(join(tmpdir(), 'flatline-render-'));
const audio = b64 ? join(dir, 'score.wav') : undefined;
if (audio) writeFileSync(audio, Buffer.from(b64, 'base64'));
const sound = audio ? ['-ss', String(from), '-t', String(to - from), '-i', audio] : [], soundOut = audio ? ['-c:a', 'aac', '-b:a', '192k', '-shortest'] : [];
const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(fps), '-i', '-', ...sound, ...soundOut, '-c:v', 'libx264', '-preset', 'medium', '-crf', a.crf, '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-map_metadata', '-1', a.out], { stdio: ['pipe', 'inherit', 'inherit'] });
const write = async (buf) => { if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r)); };
const start = Date.now();
if (shards === 1) {
  for (let i = 0; i < n; i++) {
    await write(await shoot(page, timeOf(i), jpeg));
    if (i % 150 === 0) console.log(`frame ${i}/${n} ${((Date.now() - start) / 1000).toFixed(0)}s`);
  }
} else {
  await first.browser.close();
  await captureShards({ ...film, n, shards, dir, ext: 'jpg', timeOf, shot: jpeg });
  for (let i = 0; i < n; i++) await write(readFileSync(join(dir, `f${String(i).padStart(6, '0')}.jpg`)));
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
if (shards === 1) await first.browser.close();
rmSync(dir, { recursive: true, force: true });
const sha1 = await new Promise((res) => { const h = createHash('sha1'); createReadStream(a.out).on('data', (d) => h.update(d)).on('end', () => res(h.digest('hex'))); });
json({ out: a.out, frames: n, shards, seconds: (Date.now() - start) / 1000, sha1 });
