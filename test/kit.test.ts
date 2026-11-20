import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { sailAngle, scatter, tufts, treeField, windmill } from '../src/scenery';

const ground = (x: number, z: number) => 0.05 * x + 0.02 * z;

describe('scenery', () => {
  it('scatters the wanted number of spots inside the region, on the ground, deterministically', () => {
    const o = { ground, x: [-100, 100] as [number, number], z: [0, 300] as [number, number], count: 50, size: [1, 3] as [number, number], seed: 9 };
    const a = scatter(o);
    expect(a).toHaveLength(50);
    expect(scatter(o)).toEqual(a);
    for (const s of a) {
      expect(s.x).toBeGreaterThanOrEqual(-100); expect(s.x).toBeLessThanOrEqual(100);
      expect(s.z).toBeGreaterThanOrEqual(0); expect(s.z).toBeLessThanOrEqual(300);
      expect(s.y).toBeCloseTo(ground(s.x, s.z), 9);
      expect(s.s).toBeGreaterThanOrEqual(1); expect(s.s).toBeLessThanOrEqual(3);
    }
    expect(scatter({ ...o, seed: 10 })).not.toEqual(a);
  });

  it('honours the accept test and gives up rather than loop when nothing fits', () => {
    const low = scatter({ ground, x: [-100, 100], z: [0, 300], count: 40, accept: (_x, _z, y) => y < 0 });
    expect(low.length).toBeGreaterThan(0);
    expect(low.every((s) => s.y < 0)).toBe(true);
    expect(scatter({ ground, x: [0, 10], z: [0, 10], count: 10, accept: () => false })).toEqual([]);
  });

  it('puts every trunk and crown in the instanced meshes', () => {
    const spots = scatter({ ground, x: [0, 50], z: [0, 50], count: 20 }), g = treeField(spots);
    const meshes = g.children.flatMap((c) => c.children).filter((c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh);
    expect(meshes.map((m) => m.count).sort((a, b) => a - b)).toEqual([20, 20, 100]);
    expect(tufts(spots, new THREE.ConeGeometry(1, 1, 4)).children.some((c) => (c as THREE.InstancedMesh).count === 20)).toBe(true);
  });

  it('the sails turn at the given rate and the mill scales to its height', () => {
    expect(sailAngle(60, 5)).toBeCloseTo(5 * Math.PI * 2, 9);
    expect(sailAngle(0)).toBe(0);
    const m = windmill({ height: 48 });
    expect(m.root.scale.x).toBe(2);
    m.spin(30, 4);
    expect(m.blades.rotation.z).toBeCloseTo(sailAngle(30, 4), 9);
    expect(m.blades.children.filter((c) => c instanceof THREE.Group)).toHaveLength(4);
  });
});
