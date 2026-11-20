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
