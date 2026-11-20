import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

vi.hoisted(() => {
  const ctx = { createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, fillStyle: '' };
  (globalThis as unknown as { document: unknown }).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
});

import { cat, cow, figure } from '../src/figure';

const meshes = (o: THREE.Object3D) => { let n = 0; o.traverse((c) => { if ((c as THREE.Mesh).isMesh) n++; }); return n; };
const box = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o);

describe('sealed rigs', () => {
  it('join every rigid part into its bone, keeping the model where it was', () => {
    for (const make of [() => figure({ hat: 0x333333, scarf: 0xff0000, apron: 0xffffff }), () => cat(0xe8a04a, 0xfff3dc, 0xd99a2b, 0xf7931a), () => cow()]) {
      const a = make();
      a.root.updateMatrixWorld(true);
      let parts = 0, loose = 0;
      a.root.traverse((c) => { if (c.userData.rigid) { parts++; loose += c.children.filter((k) => (k as THREE.Mesh).isMesh).length; } });
      expect(parts).toBeGreaterThan(5);
      expect(loose).toBe(0);
      expect(meshes(a.root)).toBeLessThanOrEqual(parts * 2);
      const b = box(a.root);
      expect(b.max.y).toBeGreaterThan(0.3);
      expect(b.min.y).toBeGreaterThan(-0.2);
    }
  });

  it('still bends at the joints: a pose moves the sealed limbs', () => {
    const f = figure();
    f.root.updateMatrixWorld(true);
    const before = new THREE.Vector3().setFromMatrixPosition(f.hand.matrixWorld);
    f.pose({ armR: 2.5 });
    f.root.updateMatrixWorld(true);
    const after = new THREE.Vector3().setFromMatrixPosition(f.hand.matrixWorld);
    expect(after.y - before.y).toBeGreaterThan(0.4);
  });
});
