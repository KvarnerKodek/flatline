import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { decal, softFalloff } from '../src/decal';
import { pinTo, pinned } from '../src/label';

describe('soft decals', () => {
  it('fall from 1 at the centre to 0 at the rim without a step', () => {
    expect(softFalloff(0)).toBe(1);
    expect(softFalloff(1)).toBe(0);
    expect(softFalloff(1.5)).toBe(0);
    let prev = 2;
    for (let i = 0; i <= 100; i++) { const a = softFalloff(i / 100); expect(a).toBeLessThanOrEqual(prev); prev = a; }
    expect(softFalloff(0.99)).toBeLessThan(0.001);
  });

  it('lie flat, blend without writing depth and sit off the ground by a polygon offset', () => {
    const d = decal({ size: [6, 2], map: new THREE.Texture() });
    const m = d.material as THREE.MeshBasicMaterial;
    expect([m.transparent, m.depthWrite, m.polygonOffset]).toEqual([true, false, true]);
    const box = new THREE.Box3().setFromObject(d), s = box.getSize(new THREE.Vector3());
    expect([s.x, s.z]).toEqual([6, 2]);
    expect(s.y).toBeCloseTo(0, 9);
  });
});

describe('pinned labels', () => {
  it('alpha-test and write depth on one side only', () => {
    const m = pinned(new THREE.Texture(), { width: 4 }).material as THREE.MeshBasicMaterial;
    expect(m.alphaTest).toBe(0.5);
    expect(m.depthWrite).toBe(true);
    expect(m.side).toBe(THREE.FrontSide);
  });

  it('hang off the surface by the clearance and face along its normal', () => {
    const l = pinned(new THREE.Texture(), { width: 4, height: 1 });
    pinTo(l, new THREE.Vector3(3, 2, 1), new THREE.Vector3(1, 0, 0), 0.1);
    l.updateMatrixWorld();
    expect(l.position.toArray().map((x) => +x.toFixed(6))).toEqual([3.1, 2, 1]);
    expect(new THREE.Vector3(0, 0, 1).transformDirection(l.matrixWorld).x).toBeCloseTo(1, 6);
    expect(new THREE.Vector3(0, 1, 0).transformDirection(l.matrixWorld).y).toBeCloseTo(1, 6);
  });
});

describe('pinned label quality', () => {
  it('samples the texture with anisotropy so oblique cards stay crisp', () => {
    const t = new THREE.Texture();
    pinned(t, { width: 2 });
    expect(t.anisotropy).toBeGreaterThanOrEqual(8);
  });
  it('faces along a vertical normal without degenerating', () => {
    const l = pinned(new THREE.Texture(), { width: 2 });
    pinTo(l, new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
    l.updateMatrixWorld();
    const n = new THREE.Vector3(0, 0, 1).transformDirection(l.matrixWorld);
    expect(n.y).toBeCloseTo(1, 6);
    expect(Number.isNaN(l.quaternion.x)).toBe(false);
  });
});
