import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

vi.hoisted(() => {
  const ctx = { createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, fillStyle: '' };
  (globalThis as unknown as { document: unknown }).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
});

import { FACES, figure, type FaceName } from '../src/figure';

const headKids = (f: ReturnType<typeof figure>) => f.joints.head.children;
const blushes = (f: ReturnType<typeof figure>) => headKids(f).filter((c) => ((c as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined)?.map) as Array<THREE.Mesh>;
const at = (f: ReturnType<typeof figure>, x: number) => headKids(f).filter((c) => Math.abs(c.position.x - x) < 1e-6) as Array<THREE.Mesh>;
const lowestY = (f: ReturnType<typeof figure>) => { f.root.updateMatrixWorld(true); return Math.min(...f.joints.legs.map((l) => new THREE.Vector3().setFromMatrixPosition(l.ankle.matrixWorld).y)); };

describe('faces', () => {
  it('every preset reads differently: brows, mouth and blush move', () => {
    const f = figure({}), read = (face: FaceName) => { f.pose({ face, t: 0 }); const b = at(f, 0.207), g = at(f, 0.206)[0]; return { tilt: b[0].rotation.x, lift: b[0].position.y, gape: g.visible ? g.scale.y : 0, blush: (blushes(f)[0].material as THREE.MeshBasicMaterial).opacity }; };
    const n = read('neutral'), s = read('surprise'), a = read('angry'), sad = read('sad'), shy = read('shy');
    expect(s.lift).toBeGreaterThan(n.lift + 0.015);
    expect(s.gape).toBeGreaterThan(0.5);
    expect(n.gape).toBe(0);
    expect(Math.sign(a.tilt)).not.toBe(Math.sign(sad.tilt));
    expect(a.lift).toBeLessThan(n.lift);
    expect(shy.blush).toBeGreaterThan(n.blush + 0.3);
    expect(Object.keys(FACES).length).toBeGreaterThanOrEqual(8);
  });

  it('blush is a soft gradient plane on each cheek, tucked against the head', () => {
    const f = figure({}), [l, r] = blushes(f);
    expect(blushes(f).length).toBe(2);
    expect(l.position.z * r.position.z).toBeLessThan(0);
    for (const c of [l, r]) { expect(c.position.length()).toBeGreaterThan(0.229); expect(c.position.length()).toBeLessThan(0.235); expect(c.material).toBeInstanceOf(THREE.MeshBasicMaterial); }
  });

  it('eyes and head turn towards a gaze point, to either side', () => {
    const f = figure({}), eyeZ = () => headKids(f).filter((c) => c.type === 'Group' && Math.abs(c.position.x - 0.205) < 1e-6).map((e) => Math.abs(e.position.z) - 0.082);
    f.root.updateMatrixWorld(true);
    f.pose({ t: 1, gaze: new THREE.Vector3(2, 1.6, 2) });
    const yawA = f.joints.head.rotation.y, a = eyeZ();
    f.pose({ t: 1, gaze: new THREE.Vector3(2, 1.6, -2) });
    const yawB = f.joints.head.rotation.y, b = eyeZ();
    expect(Math.sign(yawA)).not.toBe(Math.sign(yawB));
    expect(Math.abs(yawA)).toBeGreaterThan(0.1);
    expect(Math.abs(a[0]) + Math.abs(b[0])).toBeGreaterThan(0.01);
    f.pose({ t: 1, gaze: new THREE.Vector3(3, 1.62, 0) });
    expect(Math.abs(f.joints.head.rotation.y)).toBeLessThan(0.1);
  });
});

describe('squash and lift', () => {
  it('squash keeps volume, lift raises the feet, and neither moves a figure that asks for none', () => {
    const f = figure({});
    f.pose({ t: 1 });
    expect(f.root.children[0].scale.toArray()).toEqual([1, 1, 1]);
    const base = lowestY(f);
    f.pose({ t: 1, squash: -0.2, lift: 0.3 });
    const s = f.root.children[0].scale;
    expect(s.x * s.y * s.z).toBeCloseTo(1, 6);
    expect(s.y).toBeCloseTo(0.8, 6);
    expect(lowestY(f)).toBeGreaterThan(base + 0.2);
  });
});

describe('follow-through', () => {
  const turn = (t: number) => ({ headYaw: Math.min(1, Math.max(0, t - 1)) * 1.2, bow: 0 });
  const tailRot = (f: ReturnType<typeof figure>) => { const out: Array<number> = []; f.joints.head.traverse((o) => { if (o.type === 'Group' && !o.userData.rigid && o.position.x < -0.15 && o.position.y > 0) o.traverse((g) => { if (g.type === 'Group' && !g.userData.rigid) out.push(g.rotation.x); }); }); return out; };

  it('a ponytail trails a head turn, each segment lagging the one before, and settles after', () => {
    const f = figure({ hairStyle: 'ponytail' });
    f.act(turn, 0.5);
    const rest = tailRot(f);
    f.act(turn, 1.4);
    const moving = tailRot(f);
    expect(rest.length).toBe(3);
    expect(Math.abs(moving[0] - rest[0])).toBeGreaterThan(0.02);
    f.act(turn, 5);
    expect(tailRot(f)[0]).toBeCloseTo(rest[0], 3);
  });

  it('scarf tails and skirt swing with a turn too, and the result is a pure function of time', () => {
    const f = figure({ outfit: 'dirndl', scarf: 0xc8553d }), snap = () => { f.root.updateMatrixWorld(true); const o: Array<number> = []; f.root.traverse((c) => o.push(...c.rotation.toArray().slice(0, 3) as Array<number>)); return o; };
    f.act(turn, 1.4);
    const a = snap();
    f.act(turn, 3);
    f.act(turn, 1.4);
    expect(snap()).toEqual(a);
    const skirt = f.joints.pelvis.userData.skirt as THREE.Group;
    expect(Math.abs(skirt.rotation.y)).toBeGreaterThan(0.01);
  });
});
