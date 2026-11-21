import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DETECTORS, type ActorMeta, type ActorSample, type Ctx, type Sample } from '../src/qa/detectors';
import { dedup, groupHits, isIgnored, mergeReports, routeOwner, type Finding } from '../src/qa/findings';
import { accelOf, facingCos, insideObb, mergeIntervals, obbPenetration, rectOverlap, speedOf, type Obb } from '../src/qa/geom';
import { createQa } from '../src/qa/registry';
import { runQa, select, stepFor, times } from '../src/qa/run';
import { decal } from '../src/decal';
import { pinned, pinTo } from '../src/label';
import { discover, obbOf, sampleAt, screenRect, tagQa } from '../src/qa/sample';

const box = (c: [number, number, number], h: [number, number, number] = [1, 1, 1], yaw = 0): Obb => ({ c, h, ax: [[Math.cos(yaw), 0, -Math.sin(yaw)], [0, 1, 0], [Math.sin(yaw), 0, Math.cos(yaw)]] });
const meta = (name: string, o: Partial<ActorMeta> = {}): ActorMeta => ({ kind: 'person', faces: true, canReverse: false, ...o, name });
type AO = Partial<Omit<ActorSample, 'm'>> & { m?: Partial<ActorMeta> };
const actor = (name: string, p: [number, number, number], { m, ...o }: AO = {}): ActorSample => ({ m: meta(name, m), vis: true, p, fwd: [0, 0, 1], scale: 1, opacity: 1, inFrame: true, area: 0.05, ...o });
const sample = (t: number, actors: ActorSample[] = [], o: Partial<Sample> = {}): Sample => ({ t, cam: { p: [0, 0, 0], fwd: [0, 0, -1], fov: 40 }, actors, obstacles: [], labels: [], decals: [], hud: [], ...o });
const ctx = (step: number, o: Partial<Ctx> = {}): Ctx => ({ step, cuts: [], num: (_n, d) => d, ...o });
const det = (name: string) => DETECTORS.find((d) => d.name === name)!;
const dt = 1 / 30;

describe('geometry', () => {
  it('merges intervals within a gap', () => {
    expect(mergeIntervals([{ t0: 5, t1: 6 }, { t0: 0, t1: 1 }, { t0: 1.2, t1: 2 }], 0.25)).toEqual([{ t0: 0, t1: 2 }, { t0: 5, t1: 6 }]);
    expect(mergeIntervals([{ t0: 0, t1: 1 }, { t0: 1.2, t1: 2 }])).toHaveLength(2);
    expect(mergeIntervals([{ t0: 0, t1: 9 }, { t0: 1, t1: 2 }])).toEqual([{ t0: 0, t1: 9 }]);
  });
  it('measures penetration depth of aligned and rotated boxes', () => {
    expect(obbPenetration(box([0, 0, 0]), box([1.5, 0, 0]))).toBeCloseTo(0.5);
    expect(obbPenetration(box([0, 0, 0]), box([2.5, 0, 0]))).toBe(0);
    expect(obbPenetration(box([0, 0, 0]), box([0, 0, 0]))).toBeCloseTo(2);
    const a = box([0, 0, 0]), diamond = box([2.3, 0, 0], [1, 1, 1], Math.PI / 4);
    expect(obbPenetration(a, diamond)).toBeCloseTo(1 + Math.SQRT2 - 2.3, 5);
    expect(obbPenetration(a, box([3, 0, 0], [1, 1, 1], Math.PI / 4))).toBe(0);
    expect(obbPenetration(a, box([2.1, 0, 0]))).toBe(0);
  });
  it('tests a point inside a rotated box', () => {
    expect(insideObb([0.9, 0, 0], box([0, 0, 0]))).toBe(true);
    expect(insideObb([1.1, 0, 0], box([0, 0, 0]))).toBe(false);
  });
  it('computes speed, acceleration and facing', () => {
    expect(speedOf([0, 0, 0], [3, 0, 4], 0.5)).toBe(10);
    expect(accelOf([0, 0, 0], [1, 0, 0], [3, 0, 0], 1)).toBe(1);
    expect(facingCos([0, 0, 1], [0, 0, 2])).toBe(1);
    expect(facingCos([0, 0, 1], [0, 0, -2])).toBe(-1);
    expect(facingCos([0, 0, 1], [3, 5, 0])).toBeCloseTo(0);
    expect(facingCos([0, 0, 1], [0, 0, 0])).toBeNaN();
  });
  it('overlaps screen rectangles', () => {
    expect(rectOverlap({ x0: 0, y0: 0, x1: 2, y1: 2 }, { x0: 1, y0: 1, x1: 3, y1: 3 })).toBe(1);
    expect(rectOverlap({ x0: 0, y0: 0, x1: 1, y1: 1 }, { x0: 2, y0: 2, x1: 3, y1: 3 })).toBe(0);
  });
});

describe('findings', () => {
  const f = (o: Partial<Finding>): Finding => ({ detector: 'obb', kind: 'overlap', subjects: ['a', 'b'], severity: 'low', area: 'x', files: [], fix: 'f', message: 'm', t0: 0, t1: 1, peak: 1, peakT: 0.5, count: 2, repro: '', ...o });
  it('groups hits into runs per key and splits at gaps', () => {
    const h = (t: number, key: string, value: number) => ({ t, key, subjects: [key], value, note: `n${value}` });
    const g = groupHits([h(0.1, 'a', 1), h(0, 'a', 3), h(0.2, 'b', 1), h(5, 'a', 2)], 0.15);
    expect(g.map((x) => [x.subjects[0], x.t0, x.t1, x.peak, x.count])).toEqual([['a', 0, 0.1, 3, 2], ['b', 0.2, 0.2, 1, 1], ['a', 5, 5, 2, 1]]);
  });
  it('merges duplicate findings, keeps the worst peak and severity, leaves distinct ones', () => {
    const out = dedup([f({ t0: 0, t1: 1, peak: 1 }), f({ t0: 1.1, t1: 2, peak: 5, severity: 'high', message: 'worse' }), f({ t0: 9, t1: 10 }), f({ subjects: ['b', 'a'], t0: 1.5, t1: 1.6 }), f({ detector: 'speed', t0: 0, t1: 1 })]);
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ t0: 0, t1: 2, peak: 5, severity: 'high', message: 'worse', count: 6 });
  });
  it('routes to the first owner rule matching any subject, else the detector area', () => {
    const rules = [{ match: '^truck', area: 'traffic', files: ['t.ts'], agent: 'ag1' }, { match: 'house', area: 'town' }];
    expect(routeOwner(['cow', 'truck3'], rules, 'placement')).toEqual({ area: 'traffic', files: ['t.ts'], agent: 'ag1' });
    expect(routeOwner(['house1'], rules, 'placement')).toEqual({ area: 'town', files: [], agent: undefined });
    expect(routeOwner(['gull'], rules, 'placement')).toEqual({ area: 'placement', files: [] });
  });
  it('ignores hits by detector, subject and window', () => {
    const h = { t: 5, key: 'k', subjects: ['truck1'], value: 1, note: '' };
    expect(isIgnored(h, 'speed', [{ detector: 'speed', subject: 'truck', t0: 4, t1: 6 }])).toBe(true);
    expect(isIgnored(h, 'speed', [{ detector: 'obb' }])).toBe(false);
    expect(isIgnored(h, 'speed', [{ t0: 6 }])).toBe(false);
    expect(isIgnored(h, 'speed')).toBe(false);
  });
  it('merges shard reports and dedups across the seam', () => {
    const r = (range: [number, number], fs: Finding[]) => ({ version: 1 as const, url: 'u', duration: 10, range, coverage: {}, notes: ['n'], detectors: [], summary: { total: 0, bySeverity: { low: 0, medium: 0, high: 0 }, byArea: {}, byKind: {} }, findings: fs });
    const m = mergeReports([r([0, 5], [f({ t0: 4, t1: 5 })]), r([5, 10], [f({ t0: 5.03, t1: 6, severity: 'high' })])]);
    expect(m.findings).toHaveLength(1);
    expect(m).toMatchObject({ range: [0, 10], notes: ['n'], summary: { total: 1, bySeverity: { high: 1 } } });
  });
});

describe('detectors on synthetic traces', () => {
  const walk = (name: string, v: [number, number, number], n: number, o: AO = {}) => Array.from({ length: n }, (_, i) => sample(i * dt, [actor(name, [v[0] * i * dt, v[1] * i * dt, v[2] * i * dt], o)]));
  it('flags a speed spike but not a walk', () => {
    const ok = walk('p', [0, 0, 1.4], 30), fast = ok.map((s, i) => (i === 15 ? sample(s.t, [actor('p', [0, 0, 1.4 * s.t + 0.5])]) : s));
    expect(det('speed').find(ok, ctx(dt))).toEqual([]);
    expect(det('speed').find(fast, ctx(dt)).map((h) => h.subjects)).toEqual([['p'], ['p']]);
  });
  it('separates speed from teleport', () => {
    const jump = [sample(0, [actor('p', [0, 0, 0])]), sample(dt, [actor('p', [50, 0, 0])])];
    expect(det('teleport').find(jump, ctx(dt))).toHaveLength(1);
    expect(det('speed').find(jump, ctx(dt))).toHaveLength(0);
  });
  it('flags travelling backward, never a reversing vehicle or a stationary actor', () => {
    expect(det('facing').find(walk('p', [0, 0, -1.4], 5), ctx(dt))).toHaveLength(4);
    expect(det('facing').find(walk('p', [0, 0, 1.4], 5), ctx(dt))).toHaveLength(0);
    expect(det('facing').find(walk('p', [0, 0, -1.4], 5, { m: { canReverse: true } }), ctx(dt))).toHaveLength(0);
    expect(det('facing').find(walk('p', [0, 0, -0.1], 5), ctx(dt))).toHaveLength(0);
  });
  it('flags overlapping boxes in frame, skips same group, out of frame and separated', () => {
    const mk = (b: Obb, o: AO = {}) => actor('b', b.c, { obb: b, ...o, m: { kind: 'vehicle', ...o.m } });
    const a = actor('a', [0, 0, 0], { obb: box([0, 0, 0]), m: { kind: 'vehicle' } });
    const hits = (b: ActorSample) => det('obb').find([sample(0, [a, b])], ctx(0.5));
    expect(hits(mk(box([1, 0, 0])))).toHaveLength(1);
    expect(hits(mk(box([1, 0, 0]), { m: { kind: 'flyer' } }))).toHaveLength(0);
    expect(hits(mk(box([1.9, 0, 0])))).toHaveLength(0);
    const g = (n: string) => actor(n, [0, 0, 0], { obb: box([0, 0, 0]), m: { group: 'flock' } });
    expect(det('obb').find([sample(0, [g('x'), g('y')])], ctx(0.5))).toHaveLength(0);
    expect(det('obb').find([sample(0, [a], { obstacles: [{ name: 'house', obb: box([1, 0, 0]) }] })], ctx(0.5)).map((h) => h.subjects)).toEqual([['a', 'house']]);
  });
  it('flags a pop but not a fade or an off-screen flip', () => {
    const flip = (a: AO) => [sample(0, [actor('x', [0, 0, 0], { vis: false, inFrame: false, area: 0 })]), sample(dt, [actor('x', [0, 0, 0], a)])];
    expect(det('pop').find(flip({}), ctx(dt))).toHaveLength(1);
    expect(det('pop').find(flip({ opacity: 0.1 }), ctx(dt))).toHaveLength(0);
    expect(det('pop').find(flip({ scale: 0.05 }), ctx(dt))).toHaveLength(0);
    expect(det('pop').find(flip({ inFrame: false, area: 0 }), ctx(dt))).toHaveLength(0);
    expect(det('pop').find([sample(0, [actor('x', [0, 0, 0])]), sample(dt, [actor('x', [0, 0, 0], { scale: 3 })])], ctx(dt))).toHaveLength(1);
  });
  it('flags camera acceleration spikes and undeclared cuts but not declared ones', () => {
    const cam = (x: number, t: number) => sample(t, [], { cam: { p: [x, 0, 0], fwd: [0, 0, -1], fov: 40 } });
    const smooth = [0, 1, 2, 3].map((i) => cam(i * 0.1, i * dt));
    expect(det('camjerk').find(smooth, ctx(dt))).toEqual([]);
    const jerky = [cam(0, 0), cam(0, dt), cam(5, 2 * dt), cam(5, 3 * dt)];
    expect(det('camjerk').find(jerky, ctx(dt)).length).toBeGreaterThan(0);
    const cut = [cam(0, 0), cam(0, dt), cam(300, 2 * dt)];
    expect(det('camcut').find(cut, ctx(dt))).toHaveLength(1);
    expect(det('camcut').find(cut, ctx(dt, { cuts: [2 * dt] }))).toHaveLength(0);
    expect(det('camjerk').find(jerky, ctx(dt, { cuts: [2 * dt] }))).toEqual([]);
  });
  it('flags overlapping label cards and edge-on labels', () => {
    const L = (name: string, x0: number, facing = 1) => ({ name, vis: true, inFrame: true, facing, rect: { x0, y0: 0, x1: x0 + 1, y1: 1 } });
    expect(det('labels').find([sample(0, [], { labels: [L('a', 0), L('b', 0.5)] })], ctx(0.25))).toHaveLength(1);
    expect(det('labels').find([sample(0, [], { labels: [L('a', 0), L('b', 2)] })], ctx(0.25))).toHaveLength(0);
    expect(det('labelface').find([sample(0, [], { labels: [L('a', 0, -0.4), L('b', 3, 0.9)] })], ctx(0.25)).map((h) => h.subjects)).toEqual([['a']]);
  });
  it('flags coplanar decals and a decal without polygon offset', () => {
    const D = (name: string, y: number, offset = true) => ({ name, vis: true, y, offset, order: 0, box: { x0: 0, y0: 0, x1: 2, y1: 2 } });
    expect(det('decals').find([sample(0, [], { decals: [D('a', 0), D('b', 0.001)] })], ctx(1))).toHaveLength(1);
    expect(det('decals').find([sample(0, [], { decals: [D('a', 0), D('b', 0.5)] })], ctx(1))).toHaveLength(0);
    expect(det('decals').find([sample(0, [], { decals: [D('a', 0, false)] })], ctx(1))).toHaveLength(1);
  });
  it('flags overlapping HUD boxes and crushed or blown frames away from cuts', () => {
    const H = (name: string, x0: number) => ({ name, rect: { x0, y0: 0, x1: x0 + 100, y1: 40 } });
    expect(det('hudocc').find([sample(0, [], { hud: [H('.cap#0', 0), H('.tag#0', 50)] })], ctx(0.25))).toHaveLength(1);
    expect(det('hudocc').find([sample(0, [], { hud: [H('.cap#0', 0), H('.tag#0', 150)] })], ctx(0.25))).toHaveLength(0);
    const s = [sample(0, [], { luma: { blown: 0.3, dark: 0 } }), sample(10, [], { luma: { blown: 0, dark: 0.9 } }), sample(20, [], { luma: { blown: 0.9, dark: 0 } })];
    expect(det('exposure').find(s, ctx(1, { cuts: [20] })).map((h) => h.subjects[0])).toEqual(['frame-blown', 'frame-crushed']);
  });
  it('flags a camera inside an actor box', () => {
    expect(det('camclip').find([sample(0, [actor('a', [0, 0, 0], { obb: box([0, 0, 0]) })])], ctx(0.25))).toHaveLength(1);
  });
  it('flags a differing second visit but not an identical one', () => {
    const a = [sample(1, [actor('x', [0, 0, 0])])];
    expect(det('determinism').find(a, ctx(1, { again: [sample(1, [actor('x', [0, 0, 0])])] }))).toEqual([]);
    expect(det('determinism').find(a, ctx(1, { again: [sample(1, [actor('x', [0, 0.5, 0])])] }))).toHaveLength(1);
    expect(det('determinism').find([sample(1, [actor('x', [0, 0, 0], { vis: false })])], ctx(1, { again: [sample(1, [actor('x', [9, 0, 0])])] }))).toEqual([]);
  });
});

describe('sampling real objects', () => {
  const cube = (size = 1) => new THREE.Mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshBasicMaterial());
  const camera = () => { const c = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 500); c.position.set(0, 2, 20); c.lookAt(0, 0, 0); c.updateMatrixWorld(); return c; };

  it('finds tagged actors, labels, decals and obstacles, and hook-supplied ones', () => {
    const scene = new THREE.Scene(), a = tagQa(cube(), { role: 'actor', name: 'cow', kind: 'animal' }), l = tagQa(cube(), 'label'), extra = cube();
    scene.add(a, l, tagQa(cube(2), { role: 'obstacle', name: 'barn' }), extra);
    const d = discover(scene, { actors: () => [{ name: 'van', root: extra, kind: 'vehicle' }], obstacles: () => [{ name: 'wall', c: [0, 0, 0], h: [1, 1, 1] }] });
    expect(d.actors.map((x) => [x.m.name, x.m.kind, x.m.faces])).toEqual([['cow', 'animal', true], ['van', 'vehicle', true]]);
    expect(d.labels).toHaveLength(1);
    expect(discover(scene, { actors: () => [{ name: 'x', root: extra, forward: [1, 0, 0] }] }).actors.at(-1)!.m.forward).toEqual([1, 0, 0]);
    expect(d.obstacles.map((o) => o.name)).toEqual(['barn', 'wall']);
  });
  it('samples the heading along the actor forward axis', () => {
    const m = cube(), scene = new THREE.Scene(), d = (forward?: [number, number, number]) => discover(scene, { actors: () => [{ name: 'a', root: m, forward }] });
    scene.add(m);
    m.rotation.y = Math.PI / 2;
    const env = { scene, camera: camera(), seek: () => {} }, needs = new Set<'pose'>(['pose']);
    expect(sampleAt(env, d(), 0, needs).actors[0].fwd[0]).toBeCloseTo(1);
    expect(sampleAt(env, d([1, 0, 0]), 0, needs).actors[0].fwd[2]).toBeCloseTo(-1);
  });
  it('discovers pinned labels and decals by themselves and measures facing and polygon offset', () => {
    const scene = new THREE.Scene(), cam = camera();
    const front = pinTo(pinned(new THREE.Texture(), { width: 2 }), new THREE.Vector3(-3, 0, 0), new THREE.Vector3(0, 0, 1)), back = pinTo(pinned(new THREE.Texture(), { width: 2 }), new THREE.Vector3(3, 0, 0), new THREE.Vector3(0, 0, -1));
    const d1 = decal({ size: 2, map: new THREE.Texture() }), d2 = decal({ size: 2, map: new THREE.Texture() });
    scene.add(front, back, d1, d2);
    const env = { scene, camera: cam, seek: () => {} }, d = discover(scene);
    expect([d.labels.length, d.decals.length]).toEqual([2, 2]);
    const s = sampleAt(env, d, 0, new Set(['labels', 'decals']));
    expect(s.labels[0].facing).toBeGreaterThan(0.9);
    expect(s.labels[1].facing).toBeLessThan(0);
    expect(s.decals.every((x) => x.offset)).toBe(true);
    expect(det('labelface').find([s], ctx(0.25)).map((h) => h.subjects[0])).toEqual([s.labels[1].name]);
    expect(det('decals').find([s], ctx(1))).toHaveLength(1);
  });
  it('builds a shrunk box in the actor frame and projects it', () => {
    const m = cube(2);
    m.position.set(5, 0, 0); m.rotation.y = Math.PI / 2; m.scale.setScalar(2);
    const o = obbOf(m, 1)!;
    expect(o.c[0]).toBeCloseTo(5);
    expect(o.h.map((x) => +x.toFixed(3))).toEqual([2, 2, 2]);
    expect(Math.abs(o.ax[0][2])).toBeCloseTo(1);
    const r = screenRect(obbOf(cube(), 1)!, camera())!;
    expect(r.x0).toBeLessThan(0);
    expect(r.x1).toBeGreaterThan(0);
    expect(screenRect({ ...obbOf(cube(), 1)!, c: [0, 0, 30] }, camera())).toBeUndefined();
  });
  it('detects an overlap, a hidden actor and a backward walker end to end through runQa', () => {
    const scene = new THREE.Scene(), a = cube(2), b = cube(2), p = cube(0.5);
    scene.add(tagQa(a, { role: 'actor', name: 'truckA', kind: 'vehicle' }), tagQa(b, { role: 'actor', name: 'truckB', kind: 'vehicle' }), tagQa(p, { role: 'actor', name: 'walker', kind: 'person' }));
    p.rotation.y = Math.PI;
    const seek = (t: number) => { a.position.set(t - 5, 0, 0); b.position.set(5 - t, 0, 0); p.position.set(0, 0, -t); };
    const env = { scene, camera: camera(), seek };
    const qa = createQa(env, 10, { owners: [{ match: 'truck', area: 'traffic', agent: 'tr' }] });
    const { report, table } = qa.run({ only: ['obb', 'facing', 'determinism'], to: 9, step: 0.5 });
    const obb = report.findings.find((f) => f.detector === 'obb')!;
    expect(obb).toMatchObject({ subjects: ['truckA', 'truckB'], area: 'traffic', agent: 'tr', severity: 'high' });
    expect(obb.t0).toBeCloseTo(4.5, 1);
    expect(obb.t1).toBeCloseTo(5.5, 1);
    expect(obb.repro).toContain('--only obb');
    expect(report.findings.some((f) => f.detector === 'facing' && f.subjects[0] === 'walker')).toBe(false);
    expect(report.coverage.actors).toBe(3);
    expect(report.findings.some((f) => f.detector === 'determinism')).toBe(false);
    expect(table).toContain('truckA x truckB');
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });
  it('reports undiscovered coverage rather than a false all-clear', () => {
    const { report } = createQa({ scene: new THREE.Scene(), camera: camera(), seek: () => {} }, 5).run({ only: ['obb', 'labels'] });
    expect(report.notes.join(' ')).toMatch(/obb: no actors/);
    expect(report.notes.join(' ')).toMatch(/labels: no labels/);
    expect(report.summary.total).toBe(0);
  });
});

describe('runner helpers', () => {
  it('lists instants without drift and selects detectors', () => {
    expect(times(0, 1, 0.25)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(times(0, 100, 1 / 30)).toHaveLength(3001);
    expect(times(5, 1, 1)).toEqual([]);
    expect(select({ only: ['obb', 'speed'], skip: ['speed'] }).map((d) => d.name)).toEqual(['obb']);
    expect(select({}).length).toBeGreaterThanOrEqual(10);
    expect([stepFor(det('speed'), 0.5), stepFor(det('speed'), 0.01), stepFor(det('obb'), 2), stepFor(det('obb'))]).toEqual([dt, 0.01, 2, 0.5]);
  });
  it('honours ignore rules and runner overrides', () => {
    const s = { duration: 5, url: 'u', coverage: { actors: 1 }, sample: (t: number) => sample(t, [actor('p', [0, 0, t * 100])]) };
    expect(runQa(s, { only: ['speed'], to: 1, step: 0.5 }).report.findings).toHaveLength(0);
    const fast = { ...s, sample: (t: number) => sample(t, [actor('p', [0, 0, t * 100], { m: { maxSpeed: 5 } })]) };
    expect(runQa(fast, { only: ['speed'], to: 1, step: 0.01 }).report.findings).toHaveLength(1);
    expect(runQa(fast, { only: ['speed'], to: 1, step: 0.01, ignore: [{ detector: 'speed', subject: 'p' }] }).report.findings).toHaveLength(0);
    expect(runQa(fast, { only: ['speed'], to: 1, step: 0.01, config: { 'speed.teleport': 0.5 } }).report.findings).toHaveLength(0);
  });
});
