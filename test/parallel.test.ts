import { describe, expect, it } from 'vitest';
import { agentPort, countIterations, diffManifests, findCollisions, frameTime, parseIterLog, planShards, thumbDiff, touchedOnly, validateClaims, type Claim, type HashManifest } from '../src/parallel';

const th = (v: number) => btoa(String.fromCharCode(...Array(4).fill(v)));
const film = (hs: Array<[string, number]>): HashManifest => ({ fps: 10, from: 0, size: '8x8', frames: hs.map(([h, v], i) => ({ t: i / 10, h, th: th(v) })) });

describe('planShards', () => {
  it('covers every frame once, in order, balanced', () => {
    for (const [frames, n] of [[100, 7], [7, 7], [5, 9], [1, 1], [1800, 16]]) {
      const p = planShards(frames, n), sizes = p.map((s) => s.end - s.start);
      expect(p[0].start).toBe(0);
      expect(p.at(-1)!.end).toBe(frames);
      p.slice(1).forEach((s, i) => expect(s.start).toBe(p[i].end));
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
      expect(sizes.every((s) => s > 0)).toBe(true);
    }
    expect(planShards(0, 4)).toEqual([]);
  });

  it('gives each frame the same time however the range is split', () => {
    const serial = Array.from({ length: 50 }, (_, i) => frameTime({ from: 2, fps: 30, i }));
    const sharded = planShards(50, 6).flatMap((s) => Array.from({ length: s.end - s.start }, (_, k) => frameTime({ from: 2, fps: 30, i: s.start + k })));
    expect(sharded).toEqual(serial);
  });
});

describe('film diff', () => {
  const a = film([['a', 0], ['b', 0], ['c', 0], ['d', 0], ['e', 0], ['f', 0]]);
  it('is empty for identical films', () => expect(diffManifests(a, a)).toMatchObject({ comparable: true, changedFrames: 0, changes: [] }));
  it('merges changed frames into ranges sized by difference', () => {
    const b = film([['a', 0], ['B', 51], ['C', 255], ['d', 0], ['e', 0], ['F', 255]]);
    const d = diffManifests(a, b);
    expect(d.changes.map((c) => [c.t0, c.frames])).toEqual([[0.1, 2], [0.5, 1]]);
    expect(d.changes[0].t1).toBeCloseTo(0.3);
    expect(d.changes[0].maxDiff).toBeCloseTo(1);
    expect(d.changes[0].meanDiff).toBeCloseTo(0.6);
    expect(touchedOnly(d, 0.1, 0.6)).toBe(true);
    expect(touchedOnly(d, 0.1, 0.5)).toBe(false);
  });
  it('refuses films that differ in shape', () => expect(diffManifests(a, { ...a, fps: 20 }).comparable).toBe(false));
  it('thumbDiff is symmetric and bounded', () => expect([thumbDiff(th(0), th(255)), thumbDiff(th(255), th(0)), thumbDiff(th(9), th(9))]).toEqual([1, 1, 0]));
});

describe('claims', () => {
  const c = (id: string, agent: string, area: string, files: Array<string>, extra: Partial<Claim> = {}): Claim => ({ id, agent, area, files, ...extra });
  it('validates the manifest', () => {
    expect(validateClaims({ version: 1, claims: [c('a', 'x', 'hud', ['src/hud.ts'])] })).toEqual([]);
    expect(validateClaims({ version: 2, claims: [] })).toEqual(['version must be 1']);
    const bad = validateClaims({ version: 1, claims: [{ id: 'a' }, c('a', 'x', 'r', ['src/*.ts', '../x'], { time: [5, 1] })] });
    expect(bad.join()).toMatch(/agent.*area.*files/);
    expect(bad.join()).toMatch(/files src\/\*\.ts/);
    expect(bad.join()).toMatch(/files \.\.\/x/);
    expect(bad.join()).toMatch(/invalid time/);
    expect(bad.join()).toMatch(/duplicate id/);
  });
  it('finds file, lock and time collisions across agents only', () => {
    const k = findCollisions([
      c('1', 'x', 'shots', ['src/shots.ts', 'src/toon/'], { time: [0, 10], locks: ['cam'] }),
      c('2', 'y', 'shots', ['src/toon/a.ts'], { time: [9, 20], locks: ['cam'] }),
      c('3', 'y', 'hud', ['src/hud.ts'], { time: [0, 10] }),
      c('4', 'x', 'hud', ['src/hud.ts']),
    ]);
    expect(k.map((x) => `${x.a}${x.b}${x.kind}`).sort()).toEqual(['12file', '12lock', '12time', '34file', '34time'].sort());
  });
  it('treats adjacent time ranges and sibling files as free', () => {
    expect(findCollisions([c('1', 'x', 'a', ['src/ab.ts'], { time: [0, 5] }), c('2', 'y', 'a', ['src/a.ts', 'src/a/'], { time: [5, 9] })])).toEqual([]);
  });
});

describe('iteration log', () => {
  const ok = (n: number, area = 'p', v = true) => JSON.stringify({ n, area, change: 'c', evidence: { kind: 'test', ref: 'parallel.test.ts' }, verified: v });
  it('counts verified iterations by area and keeps legacy lines apart', () => {
    const log = parseIterLog(`# log\n1. old line\n${ok(1)}\n${ok(2, 'q')}\n${ok(3, 'p', false)}\n`);
    expect(log.errors).toEqual([]);
    expect(countIterations(log.entries)).toEqual({ verified: 2, unverified: 1, legacy: 1, byArea: { p: 1, q: 1 } });
    expect(countIterations(log.entries, { legacyVerified: true }).verified).toBe(3);
  });
  it('flags malformed, duplicate and evidence-free lines', () => {
    const log = parseIterLog(`nonsense\n${ok(1)}\n${ok(1)}\n{"n":2,"area":"p","change":"c","verified":true}`);
    expect(log.errors).toHaveLength(3);
    expect(log.entries).toHaveLength(2);
  });
});

describe('agentPort', () => {
  it('is stable, in range, and avoids taken and reserved ports', () => {
    const p = agentPort({ agent: 'a1' });
    expect(agentPort({ agent: 'a1' })).toBe(p);
    expect(p).toBeGreaterThanOrEqual(5200);
    expect(p).toBeLessThan(6000);
    expect(agentPort({ agent: 'a1', taken: [p] })).not.toBe(p);
    expect(agentPort({ agent: 'z', base: 5180, span: 11 })).not.toBe(5180);
  });
  it('spreads 1000 agents over distinct ports when taken is fed back', () => {
    const ports = Array.from({ length: 700 }, (_, i) => `agent-${i}`).reduce<Array<number>>((t, agent) => [...t, agentPort({ agent, taken: t })], []);
    expect(new Set(ports).size).toBe(700);
  });
});
