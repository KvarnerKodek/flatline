import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  const ctx = { createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, fillStyle: '' };
  (globalThis as unknown as { document: unknown }).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
});

import { fishingBoat, sailboat, motorBoat } from '../src/props';
import { timeWarp, trapezoid } from '../src/timeline';
import * as THREE from 'three';

const widthNear = (root: THREE.Object3D, x: number, tol = 0.6) => {
  let w = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.userData.skip) return;
    const a = m.geometry.getAttribute('position');
    for (let i = 0; i < a.count; i++) if (Math.abs(a.getX(i) - x) < tol && a.getY(i) > -0.3 && a.getY(i) < 0.4) w = Math.max(w, Math.abs(a.getZ(i)));
  });
  return w;
};

describe('hull direction', () => {
  for (const [name, craft] of [['fishing', fishingBoat()], ['sailboat', sailboat()], ['motor', motorBoat()]] as const) {
    it(`${name} points its bow along +x and carries its lights there`, () => {
      const half = craft.length / 2;
      expect(widthNear(craft.root, half - 0.4)).toBeLessThan(widthNear(craft.root, -half + 0.4));
      for (const lamp of craft.lamps) if (lamp.material.color.r > 0.9 && lamp.material.color.g < 0.4) expect(lamp.position.x).toBeGreaterThan(0);
    });
  }
});

describe('time helpers', () => {
  it('trapezoid is monotonic from 0 to 1', () => {
    let prev = -1;
    for (let i = 0; i <= 100; i++) {
      const v = trapezoid(i / 100);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = v;
    }
    expect(trapezoid(0)).toBe(0);
    expect(trapezoid(1)).toBeCloseTo(1, 12);
  });

  it('time warp cuts and stretches without gaps', () => {
    const w = timeWarp([{ from: 50, to: 80, filmFrom: 60, filmTo: 75 }]);
    expect(w(10)).toBe(10);
    expect(w(50)).toBe(60);
    expect(w(65)).toBeCloseTo(67.5, 9);
    expect(w(80)).toBe(75);
    expect(w(90)).toBe(85);
    let prev = -1;
    for (let t = 0; t < 120; t += 0.5) {
      expect(w(t)).toBeGreaterThanOrEqual(prev);
      prev = w(t);
    }
  });
});

describe('freeze', () => {
  it('stops settled subtrees from recomputing while moving ones still follow their transforms', async () => {
    const { freeze } = await import('../src/props');
    const scene = new THREE.Scene(), still = new THREE.Group(), leaf = new THREE.Object3D(), mover = new THREE.Group();
    still.position.set(5, 0, 0); still.add(leaf); leaf.position.set(1, 0, 0);
    scene.add(still, mover);
    freeze(scene, [mover]);
    expect(leaf.getWorldPosition(new THREE.Vector3()).x).toBeCloseTo(6, 9);
    still.position.x = 50; mover.position.x = 7;
    scene.updateMatrixWorld();
    expect(new THREE.Vector3().setFromMatrixPosition(leaf.matrixWorld).x).toBeCloseTo(6, 9);
    expect(new THREE.Vector3().setFromMatrixPosition(mover.matrixWorld).x).toBeCloseTo(7, 9);
  });
});

describe('bake', () => {
  it('merges settled meshes that share a material into one per tile, in world space, and leaves moving ones alone', async () => {
    const { bake } = await import('../src/props');
    const scene = new THREE.Scene(), mat = new THREE.MeshBasicMaterial(), other = new THREE.MeshBasicMaterial();
    const box = new THREE.BoxGeometry(1, 1, 1);
    const a = new THREE.Group(); a.position.set(10, 0, 0); a.add(new THREE.Mesh(box, mat));
    const b = new THREE.Mesh(box, mat); b.position.set(0, 0, 5);
    const lone = new THREE.Mesh(box, other); lone.position.set(3, 0, 0);
    const far = new THREE.Mesh(box, mat); far.position.set(1000, 0, 0);
    const mover = new THREE.Mesh(box, mat);
    scene.add(a, b, lone, far, mover);
    expect(bake(scene, [mover], 100)).toBe(1);
    const meshes: THREE.Mesh[] = [];
    scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
    expect(meshes.length).toBe(4);
    expect(meshes as THREE.Object3D[]).toContain(lone);
    expect(meshes as THREE.Object3D[]).toContain(far);
    expect(meshes as THREE.Object3D[]).toContain(mover);
    const merged = meshes.find((m) => !([lone, far, mover] as THREE.Mesh[]).includes(m))!;
    merged.geometry.computeBoundingBox();
    expect(merged.geometry.boundingBox!.min.toArray()).toEqual([-0.5, -0.5, -0.5]);
    expect(merged.geometry.boundingBox!.max.toArray()).toEqual([10.5, 0.5, 5.5]);
    expect(merged.matrixAutoUpdate).toBe(false);
    expect(mover.matrixAutoUpdate).toBe(true);
    expect(a.parent).toBeNull();
  });
});
