import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { updateWorld } from '../src/world';

const build = (rnd: () => number) => {
  const all: Array<THREE.Object3D> = [], root = new THREE.Scene(), grow = (p: THREE.Object3D, d: number) => {
    for (let i = 0; i < 3; i++) {
      const o = new THREE.Object3D();
      o.position.set(rnd(), rnd(), rnd()); o.rotation.set(rnd(), rnd(), rnd()); o.scale.setScalar(0.5 + rnd());
      p.add(o); all.push(o);
      if (d) grow(o, d - 1);
    }
  };
  grow(root, 3);
  return { root, all };
};
const lcg = (s: number) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);

describe('updateWorld', () => {
  it('matches Object3D.updateMatrixWorld through random moves, reparenting and frozen objects', () => {
    const r1 = lcg(7), r2 = lcg(7), a = build(r1), b = build(r2), pick = lcg(99);
    a.all[5].matrixWorldAutoUpdate = b.all[5].matrixWorldAutoUpdate = false;
    for (let step = 0; step < 40; step++) {
      for (let k = 0; k < 4; k++) {
        const i = Math.floor(pick() * a.all.length), x = pick();
        for (const o of [a.all[i], b.all[i]]) { o.position.x = x; o.rotation.y = x * 2; }
      }
      if (step === 20) { a.all[3].add(a.all[30]); b.all[3].add(b.all[30]); }
      updateWorld(a.root);
      b.root.updateMatrixWorld();
      a.all.forEach((o, i) => o.matrixWorld.elements.forEach((v, k) => expect(v).toBeCloseTo(b.all[i].matrixWorld.elements[k], 9)));
    }
  });

  it('recomposes nothing when nothing moved', () => {
    const { root, all } = build(lcg(3));
    updateWorld(root);
    let n = 0;
    all.forEach((o) => { o.updateMatrix = () => { n++; }; });
    updateWorld(root);
    expect(n).toBe(0);
  });

  it('updates cameras and other overrides through their own method', () => {
    const root = new THREE.Scene(), cam = new THREE.PerspectiveCamera();
    root.add(cam);
    updateWorld(root);
    cam.position.set(1, 2, 3);
    updateWorld(root);
    expect(cam.matrixWorldInverse.elements[14]).toBeCloseTo(-3);
  });
});
