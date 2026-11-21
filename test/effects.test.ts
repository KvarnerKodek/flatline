import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Butterflies, flutter } from '../src/butterflies';
import { Burst, Fireworks, FireworkOpts, sparkAt, sparksPerBurst } from '../src/fireworks';
import { Smoke, puffAt } from '../src/smoke';
import { Puffs } from '../src/motes';

const smokeOpts = { per: 7, color: 0, rate: 0.16, radius: [0.5, 2.9] as [number, number], rise: 15, lean: 9, wobble: 1 };
const fw: Required<FireworkOpts> = { colors: [1], hot: [2, 3], rays: 40, trail: 4, life: 2.2, rise: 0.7, climb: 60, sag: 14, size: 3.2 };

describe('smoke', () => {
  it('puffs rise and lean downwind, and are invisible at the ends of their life', () => {
    const early = puffAt(0, 0, 0, smokeOpts), t = 0.5 / smokeOpts.rate - 0.1, mid = puffAt(t, 0, 0, smokeOpts);
    expect(early.r).toBe(0);
    expect(mid.y).toBeGreaterThan(0);
    expect(mid.x).toBeGreaterThan(0);
    expect(puffAt(0.99 / smokeOpts.rate, 0, 0, smokeOpts).r).toBeLessThan(0.05);
  });

  it('is a pure function of time', () => {
    expect(puffAt(12.3, 2, 3, smokeOpts)).toEqual(puffAt(12.3, 2, 3, smokeOpts));
    const s = new Smoke([new THREE.Vector3(1, 2, 3)], { per: 4 });
    s.update(5);
    const a = [...(s.group.children[0].children[0] as THREE.InstancedMesh).instanceMatrix.array];
    s.update(9); s.update(5);
    expect([...(s.group.children[0].children[0] as THREE.InstancedMesh).instanceMatrix.array]).toEqual(a);
  });
});

describe('puffs', () => {
  const geo = (p: Puffs) => (p.group.children[0] as THREE.Mesh).geometry as THREE.InstancedBufferGeometry;
  const shape = (p: Puffs, n: number) => {
    const g = geo(p);
    return Array.from({ length: g.instanceCount }, (_, i) => [...g.getAttribute('iSA').array.slice(i * 3, i * 3 + 3)]).slice(-n);
  };
  it('keep each puff\'s outline with its seed, so puffs born or faded out ahead of it never reshape it', () => {
    const p = new Puffs(8);
    p.begin(); p.add(0, 0, 0, 1, 1, 3); p.add(0, 1, 0, 2, 0.5, 4); p.end();
    const before = shape(p, 2);
    p.begin(); p.add(0, 0, 0, 1, 0, 9); p.add(5, 5, 5, 1, 1, 2); p.add(0, 0, 0, 1, 1, 3); p.add(0, 1, 0, 2, 0.5, 4); p.end();
    expect(shape(p, 2)).toEqual(before);
    expect(geo(p).instanceCount).toBe(3);
  });
  it('hide when empty and drop puffs past their budget', () => {
    const p = new Puffs(2);
    p.begin(); p.end();
    expect(p.group.visible).toBe(false);
    p.begin(); for (let i = 0; i < 5; i++) p.add(i, 0, 0, 1, 1, i); p.end();
    expect(p.group.visible).toBe(true);
    expect(geo(p).instanceCount).toBe(2);
  });
});

describe('butterflies', () => {
  const span = 150, drift: [number, number] = [1.4, 0.9];

  it('stay inside the lattice around the focus and fade at its edge', () => {
    for (let i = 0; i < 56; i++)
      for (const t of [0, 7.3, 91]) {
        const p = flutter(i, t, { x: 40, z: -20 }, { span, drift });
        expect(Math.abs(p.x - 40)).toBeLessThanOrEqual(span / 2);
        expect(Math.abs(p.z + 20)).toBeLessThanOrEqual(span / 2);
        expect(p.fade).toBeGreaterThanOrEqual(0);
        expect(p.fade).toBeLessThanOrEqual(1);
      }
  });

  it('flies over the ground and repeats for the same time', () => {
    const b = new Butterflies((x) => 0.1 * x, { count: 5 });
    b.update(3, new THREE.Vector3(10, 0, 10));
    const mesh = b.group.children[0].children[0] as THREE.InstancedMesh, a = [...mesh.instanceMatrix.array];
    expect(a[13]).toBeGreaterThan(-2000);
    b.update(8, new THREE.Vector3(10, 0, 10)); b.update(3, new THREE.Vector3(10, 0, 10));
    expect([...mesh.instanceMatrix.array]).toEqual(a);
  });

  it('shrink to nothing when hidden', () => {
    const b = new Butterflies(() => 0, { count: 3 });
    b.update(1, new THREE.Vector3(), 0);
    expect((b.group.children[0].children[0] as THREE.InstancedMesh).instanceMatrix.array[0]).toBe(0);
  });
});

describe('fireworks', () => {
  it('lights nothing before the shell rises or after the burst has died', () => {
    for (let k = 0; k < sparksPerBurst(fw); k++) {
      expect(sparkAt(k, -5, 30, fw)).toBeNull();
      expect(sparkAt(k, 3, 30, fw)).toBeNull();
    }
  });

  it('flings sparks outward on a sphere that never exceeds the burst radius plus sag', () => {
    for (let k = 0; k < fw.rays * fw.trail; k++) {
      const s = sparkAt(k, 1.5, 30, fw);
      if (!s) continue;
      expect(Math.hypot(s.x, s.z)).toBeLessThanOrEqual(30 + 1e-9);
      expect(Math.abs(s.y)).toBeLessThanOrEqual(30 + fw.sag);
    }
    expect(sparkAt(0, 1.5, 30, fw)).toEqual(sparkAt(0, 1.5, 30, fw));
  });

  it('the rising shell comes up below the burst point', () => {
    const k = fw.rays * fw.trail, s = sparkAt(k, -0.35, 30, fw)!;
    expect(s.y).toBeLessThan(0);
    expect(sparkAt(k, 0, 30, fw)!.y).toBeCloseTo(0, 6);
  });

  it('draws only live sparks', () => {
    const bursts: Burst[] = [{ t: 5, p: new THREE.Vector3(0, 50, 0), r: 25 }];
    const f = new Fireworks(bursts);
    f.update(0);
    const g = f.group.children[0] as THREE.Points;
    expect(g.visible).toBe(false);
    f.update(5.5);
    expect(g.visible).toBe(true);
    expect(g.geometry.drawRange.count).toBeGreaterThan(20);
  });
});
