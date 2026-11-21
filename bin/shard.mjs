#!/usr/bin/env node
// Parallel tooling for many agents refining one film. Every command prints one JSON object; exit 1 means a check failed.
//   shard plan --frames N --shards K
//   shard hash --url U --out hashes.json [--shards 4] [--fps 4] [--from 0] [--to s] [--size 480x270]
//   shard diff a.json b.json [--within t0,t1]       which times differ, by how much
//   shard claims claims.json                         validate and find collisions
//   shard iter log.md [more.md] [--min N] [--legacy-verified]
//   shard harness --film dir --agent id [--cache dir] [--dry]   isolated port, shared Vite cache
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { CHROME, P, captureShards, filmDuration, json } from './lib.mjs';

const { values: a, positionals: [cmd, ...rest] } = parseArgs({
  allowPositionals: true,
  options: {
    frames: { type: 'string' }, shards: { type: 'string', default: '4' }, url: { type: 'string' }, out: { type: 'string' }, fps: { type: 'string', default: '4' },
    from: { type: 'string', default: '0' }, to: { type: 'string' }, size: { type: 'string', default: '480x270' }, within: { type: 'string' }, min: { type: 'string' },
    'legacy-verified': { type: 'boolean', default: false }, film: { type: 'string' }, agent: { type: 'string' }, cache: { type: 'string' }, dry: { type: 'boolean', default: false },
    chrome: { type: 'string', default: CHROME }, software: { type: 'boolean', default: false },
  },
});
const read = (f) => JSON.parse(readFileSync(f, 'utf8'));
const done = (o, ok = true) => { json(o); process.exit(ok ? 0 : 1); };

const commands = {
  plan: () => done({ shards: P.planShards(Number(a.frames), Number(a.shards)) }),

  async hash() {
    if (!a.url || !a.out) done({ error: 'usage: shard hash --url U --out hashes.json' }, false);
    const fps = Number(a.fps), from = Number(a.from);
    const dir = mkdtempSync(join(tmpdir(), 'flatline-hash-'));
    const film = { url: a.url, size: a.size, chrome: a.chrome, software: a.software };
    const dur = a.to ? Number(a.to) : await filmDuration(film);
    const n = Math.round((dur - from) * fps);
    const timeOf = (i) => P.frameTime({ from, fps, i });
    const { hashes, shards, problems } = await captureShards({ ...film, n, shards: Number(a.shards), dir, timeOf });
    const raw = execFileSync('ffmpeg', ['-v', 'error', '-framerate', String(fps), '-i', join(dir, 'f%06d.png'), '-vf', 'scale=16:9:flags=area,format=gray', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 1 << 30 });
    const frames = hashes.map((h, i) => ({ t: timeOf(i), h, th: raw.subarray(i * 144, (i + 1) * 144).toString('base64') }));
    rmSync(dir, { recursive: true, force: true });
    writeFileSync(a.out, JSON.stringify({ fps, from, size: a.size, frames }));
    done({ out: a.out, frames: n, shards, problems });
  },

  diff() {
    const [x, y] = rest;
    const d = P.diffManifests(read(x), read(y));
    if (!a.within) done(d, d.comparable);
    const [t0, t1] = a.within.split(',').map(Number);
    const within = P.touchedOnly(d, t0, t1);
    done({ ...d, within: [t0, t1], touchedOnlyWithin: within }, within);
  },

  claims() {
    const m = read(rest[0]);
    const errors = P.validateClaims(m);
    const collisions = errors.length ? [] : P.findCollisions(m.claims);
    done({ claims: m.claims?.length ?? 0, errors, collisions, ok: !errors.length && !collisions.length }, !errors.length && !collisions.length);
  },

  iter() {
    const log = P.parseIterLog(rest.map((f) => readFileSync(f, 'utf8')).join('\n'));
    const count = P.countIterations(log.entries, { legacyVerified: a['legacy-verified'] });
    const ok = !log.errors.length && count.verified >= Number(a.min ?? 0);
    done({ errors: log.errors, ...count, min: Number(a.min ?? 0), ok }, ok);
  },

  async harness() {
    if (!a.film || !a.agent) done({ error: 'usage: shard harness --film dir --agent id [--cache dir] [--dry]' }, false);
    const film = resolve(a.film), cache = resolve(a.cache ?? join(tmpdir(), 'flatline-cache'));
    const reg = join(cache, 'agents');
    mkdirSync(reg, { recursive: true });
    const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
    const live = readdirSync(reg).map((f) => ({ f, ...read(join(reg, f)) }));
    live.filter((e) => !alive(e.pid)).forEach((e) => rmSync(join(reg, e.f)));
    const free = (port) => new Promise((ok) => { const s = createServer().once('error', () => ok(false)).listen(port, '127.0.0.1', () => s.close(() => ok(true))); });
    const taken = live.filter((e) => alive(e.pid)).map((e) => e.port);
    let port;
    for (;;) { port = P.agentPort({ agent: a.agent, taken }); if (await free(port)) break; taken.push(port); }
    const wrapper = join(cache, 'vite.harness.config.mjs');
    writeFileSync(wrapper, `import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const film = process.env.FL_FILM;
const vite = await import(pathToFileURL(join(dirname(createRequire(film + '/').resolve('vite/package.json')), 'dist/node/index.js')).href);
const loaded = await vite.loadConfigFromFile({ command: 'serve', mode: 'development' }, undefined, film);
export default vite.mergeConfig(loaded?.config ?? {}, { root: film, cacheDir: process.env.FL_CACHE + '/vite', server: { host: '127.0.0.1', port: Number(process.env.FL_PORT), strictPort: true } });
`);
    const env = { ...process.env, FL_FILM: film, FL_CACHE: cache, FL_PORT: String(port) };
    const args = ['vite', '--config', wrapper];
    const info = { agent: a.agent, port, url: `http://127.0.0.1:${port}/`, cache, command: ['npx', ...args], cwd: film };
    if (a.dry) done({ ...info, dry: true });
    const child = spawn('npx', args, { cwd: film, env, stdio: 'inherit' });
    writeFileSync(join(reg, `${a.agent}.json`), JSON.stringify({ port, pid: child.pid }));
    json(info);
    const stop = () => { rmSync(join(reg, `${a.agent}.json`), { force: true }); child.kill(); };
    process.on('SIGINT', () => { stop(); process.exit(0); });
    child.on('exit', (c) => { rmSync(join(reg, `${a.agent}.json`), { force: true }); process.exit(c ?? 0); });
  },
};
if (!commands[cmd]) done({ error: `unknown command ${cmd}`, commands: Object.keys(commands) }, false);
await commands[cmd]();
