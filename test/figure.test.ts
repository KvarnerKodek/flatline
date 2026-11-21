import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

vi.hoisted(() => {
  const ctx = { createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, fillStyle: '' };
  (globalThis as unknown as { document: unknown }).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
});

import { figure } from '../src/figure';
import { G } from '../src/toon';

const lowestY = (o: THREE.Object3D) => {
  o.updateMatrixWorld(true);
  let y = Infinity;
  const v = new THREE.Vector3();
  o.traverse((c) => { const m = c as THREE.Mesh; if (!m.isMesh || m.geometry.type === 'CircleGeometry') return; const p = m.geometry.getAttribute('position'); for (let i = 0; i < p.count; i += 3) y = Math.min(y, v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld).y); });
  return y;
};
const feet = (f: ReturnType<typeof figure>) => {
  f.root.updateMatrixWorld(true);
  return f.joints.legs.flatMap((l) => new THREE.Vector3().setFromMatrixPosition(l.ankle.matrixWorld).toArray());
};

describe('figure rig', () => {
  for (const outfit of [undefined, 'dirndl', 'lederhosen'] as const) {
    it(`${outfit ?? 'plain'}: feet stay planted and on the ground through idle breathing and weight shift`, () => {
      const f = figure({ outfit, hairStyle: 'braids' });
      f.pose({ t: 0 });
      const a = feet(f);
      expect(Math.abs(lowestY(f.root))).toBeLessThan(0.02);
      for (const t of [1.3, 4.7, 9.1]) {
        f.pose({ t });
        feet(f).forEach((v, i) => expect(v).toBeCloseTo(a[i], 3));
        expect(Math.abs(lowestY(f.root))).toBeLessThan(0.02);
      }
    });
  }

  it('walks with the stance foot on the ground at every phase, never floating or sinking', () => {
    const f = figure({ outfit: 'lederhosen' });
    for (let w = 0; w < Math.PI * 2; w += 0.4) {
      f.pose({ walk: w, stride: 0.5, t: 3 });
      expect(Math.abs(lowestY(f.root))).toBeLessThan(0.03);
    }
  });

  it('puts the palm on a grip target anywhere within reach, for both hands', () => {
    const f = figure({ outfit: 'dirndl' });
    f.root.position.set(4, 0, -2);
    f.root.rotation.y = 0.7;
    f.root.updateMatrixWorld(true);
    const local = [new THREE.Vector3(0.35, 1.5, 0.25), new THREE.Vector3(0.4, 1.1, 0.2), new THREE.Vector3(0.2, 1.9, 0.3), new THREE.Vector3(0.3, 1.25, -0.05)];
    const at = (o: THREE.Object3D) => new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
    for (const l of local) {
      const right = f.root.localToWorld(l.clone()), left = f.root.localToWorld(l.clone().setZ(-l.z));
      f.pose({ gripR: right, gripL: left, t: 2 });
      f.root.updateMatrixWorld(true);
      expect(at(f.handR).distanceTo(right)).toBeLessThan(0.01);
      expect(at(f.handL).distanceTo(left)).toBeLessThan(0.01);
    }
  });

  it('eases a hand from its own pose onto a grip, continuously, with no jump at either end', () => {
    const f = figure();
    f.root.updateMatrixWorld(true);
    const at = () => { f.root.updateMatrixWorld(true); return new THREE.Vector3().setFromMatrixPosition(f.handR.matrixWorld); };
    const grip = new THREE.Vector3(0.4, 1.6, 0.3), base = { armR: 0.3, t: 1 };
    f.pose(base);
    const free = at();
    let last = free;
    for (let k = 0; k <= 1.0001; k += 0.05) {
      f.pose({ ...base, gripR: grip, gripMixR: k });
      const now = at();
      expect(now.distanceTo(free.clone().lerp(grip, k))).toBeLessThan(0.01);
      expect(now.distanceTo(last)).toBeLessThan(0.06);
      last = now;
    }
    expect(last.distanceTo(grip)).toBeLessThan(0.01);
  });

  it('is a pure function of film time: the same instant always gives the same pose', () => {
    const f = figure({ outfit: 'dirndl', hairStyle: 'braids' }), snap = () => { f.root.updateMatrixWorld(true); const o: number[] = []; f.root.traverse((c) => o.push(...c.matrixWorld.elements)); return o; };
    G.uTime.value = 7.25; f.pose({});
    const a = snap();
    G.uTime.value = 31; f.pose({});
    G.uTime.value = 7.25; f.pose({});
    expect(snap()).toEqual(a);
  });
});

describe('garments', () => {
  it('face outward, so a skirt is seen from outside and never as an open shell', () => {
    const f = figure({ outfit: 'dirndl', apron: 0xffffff });
    f.pose({ t: 0 });
    const skirt = f.joints.pelvis.children.find((c) => c.position.y > 0.1 && c.position.y < 0.3)!;
    const meshes: THREE.Mesh[] = [];
    skirt.traverse((c) => { if ((c as THREE.Mesh).isMesh) meshes.push(c as THREE.Mesh); });
    let outward = 0, total = 0;
    const p = new THREE.Vector3(), n = new THREE.Vector3();
    for (const m of meshes) {
      if ((m.material as THREE.Material).side === THREE.BackSide) continue;
      const pos = m.geometry.getAttribute('position'), nrm = m.geometry.getAttribute('normal');
      for (let i = 0; i < pos.count; i += 5) { p.fromBufferAttribute(pos, i).setY(0); n.fromBufferAttribute(nrm, i).setY(0); if (p.lengthSq() > 1e-4) { total++; if (p.dot(n) > 0) outward++; } }
    }
    expect(outward / total).toBeGreaterThan(0.95);
  });
});

describe('carry', () => {
  it('puts both palms on the sides of a carried object whenever both arms are lifted, and lets go when they drop', () => {
    const f = figure({ outfit: 'lederhosen' });
    const wheel = new THREE.Object3D();
    wheel.position.set(0.42, 0.5, 0);
    f.joints.spine.add(wheel);
    f.carry(wheel, 0.3);
    f.root.position.set(3, 1, 2); f.root.rotation.y = 1.1;
    const at = (o: THREE.Object3D) => new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
    for (const w of [0, 1.3, 2.9]) {
      f.pose({ walk: w, stride: 0.5, armL: 1.5, armR: 1.5, t: 1 });
      f.root.updateMatrixWorld(true);
      const c = at(wheel);
      expect(at(f.handL).distanceTo(c)).toBeCloseTo(0.3, 1);
      expect(at(f.handR).distanceTo(c)).toBeCloseTo(0.3, 1);
      expect(at(f.handL).distanceTo(at(f.handR))).toBeCloseTo(0.6, 1);
    }
    f.pose({ armL: 0, armR: 0, t: 1 });
    f.root.updateMatrixWorld(true);
    expect(at(f.handR).distanceTo(at(wheel))).toBeGreaterThan(0.35);
  });
});

describe('acting curves', () => {
  it('a gesture winds up, overshoots, settles, and never jumps', async () => {
    const { gesture } = await import('../src/figure');
    expect(gesture(0.9, 1, 2)).toBe(0);
    expect(gesture(3.1, 1, 2)).toBe(1);
    let lo = 0, hi = 0, prev = 0, jump = 0;
    for (let t = 1; t <= 3; t += 0.005) { const g = gesture(t, 1, 2); lo = Math.min(lo, g); hi = Math.max(hi, g); jump = Math.max(jump, Math.abs(g - prev)); prev = g; }
    expect(lo).toBeLessThan(-0.1);
    expect(hi).toBeGreaterThan(1.05);
    expect(jump).toBeLessThan(0.03);
  });

  it('holds ease in and out, and poses blend field by field', async () => {
    const { held, mixPose } = await import('../src/figure');
    expect(held(0, 1, 3)).toBe(0);
    expect(held(2, 1, 3)).toBe(1);
    expect(held(3.5, 1, 3)).toBe(0);
    const m = mixPose({ armR: 0, mood: -1 }, { armR: 2, mood: 1, headYaw: 0.5 }, 0.5);
    expect(m.armR).toBeCloseTo(1);
    expect(m.mood).toBeCloseTo(0);
    expect(m.headYaw).toBeCloseTo(0.25);
  });
});

describe('idle life', () => {
  it('blinks every few seconds, each blink a few frames long, at different times for different people', () => {
    const a = figure({}), b = figure({});
    const shut = (f: ReturnType<typeof figure>) => f.joints.head.children.filter((c) => c.type === 'Group' && c.children.length >= 2 && (c as THREE.Group).position.x > 0.2).every((e) => e.scale.y < 0.5);
    const starts: number[][] = [[], []];
    const runs = (f: ReturnType<typeof figure>, s: number[]) => { const out: number[] = []; let n = 0; for (let k = 0; k < 30 * 30; k++) { f.pose({ t: k / 30 }); if (shut(f)) { if (!n) s.push(k); n++; } else if (n) { out.push(n); n = 0; } } return out; };
    const ra = runs(a, starts[0]); runs(b, starts[1]);
    expect(ra.length).toBeGreaterThanOrEqual(5);
    expect(ra.length).toBeLessThanOrEqual(14);
    for (const n of ra) { expect(n).toBeGreaterThanOrEqual(2); expect(n).toBeLessThanOrEqual(8); }
    expect(starts[1].join()).not.toEqual(starts[0].join());
  });
});

describe('walk', () => {
  it('keeps each stance foot fixed on the ground while the body travels at walkSpeed', async () => {
    const { walkSpeed } = await import('../src/figure');
    const f = figure({ outfit: 'lederhosen' }), v = walkSpeed(0.5);
    const at = (i: number) => new THREE.Vector3().setFromMatrixPosition(f.joints.legs[i].ankle.matrixWorld);
    let worst = 0, lifted = 0;
    const prev: (THREE.Vector3 | null)[] = [null, null];
    for (let w = 0; w < Math.PI * 4; w += 0.05) {
      f.root.position.x = v * w;
      f.pose({ walk: w, stride: 0.5, t: 0 });
      f.root.updateMatrixWorld(true);
      for (const i of [0, 1]) {
        const p = at(i);
        if (p.y < 0.065) { if (prev[i]) worst = Math.max(worst, p.distanceTo(prev[i]!)); prev[i] = p; } else { prev[i] = null; lifted = Math.max(lifted, p.y); }
      }
    }
    expect(worst).toBeLessThan(0.006);
    expect(lifted).toBeGreaterThan(0.12);
  });
});

describe('hold', () => {
  it('keeps a held prop in the palm through any pose, a grip target or a walk, and lets it go', () => {
    const f = figure({ outfit: 'dirndl' }), phone = new THREE.Object3D(), scene = new THREE.Scene();
    scene.add(f.root);
    f.hold('R', phone);
    const at = (o: THREE.Object3D) => new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
    for (const p of [{ armR: 1.7 }, { gripR: new THREE.Vector3(0.4, 1.4, 0.3) }, { walk: 1.1, stride: 0.5 }, {}]) {
      f.pose({ ...p, t: 1 });
      scene.updateMatrixWorld(true);
      expect(at(phone).distanceTo(at(f.handR))).toBeLessThan(0.03);
    }
    f.hold('R', null);
    expect(phone.parent).toBeNull();
  });
});
