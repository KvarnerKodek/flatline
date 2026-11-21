import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Obstacle, Occupancy } from '../src/occupancy';

const obs: Array<Obstacle> = Array.from({ length: 40 }, (_, i) => ({ x: (i * 37) % 280 - 140, z: (i * 53) % 260 - 130, r: 2 + (i % 5), h: 3 + (i % 7) }));
const q = (a: ArrayLike<number>) => Array.from(a, (v) => Math.round(v * 1e3));
const sum = (a: ArrayLike<number>) => q(a).reduce((s, v, i) => (s + v * ((i % 97) + 1)) % 1e9, 0);
const state = (o: Occupancy) => ({
  tiles: sum(o.tiles.instanceMatrix.array), blocks: sum(o.blocks.instanceMatrix.array),
  tc: sum(o.tiles.geometry.getAttribute('iCol').array), bc: sum(o.blocks.geometry.getAttribute('iCol').array),
});
const pathOf = (o: Occupancy) => {
  const g = o.path.geometry, n = g.drawRange.count === Infinity ? g.index!.count : g.drawRange.count;
  return { n, pos: sum(Array.from(g.getAttribute('position').array).slice(0, (n / 6 + 1) * 6)), u: sum(Array.from(g.getAttribute('aU').array).slice(0, (n / 6 + 1) * 2)), idx: Array.from(g.index!.array).slice(0, 12) };
};

describe('occupancy', () => {
  it('fills the grid deterministically', () => {
    const o = new Occupancy();
    o.update(1, 3.3, -8.1, 0.4, obs, 0.8, 1);
    expect(state(o)).toMatchInlineSnapshot(`
      {
        "bc": 279734377,
        "blocks": 274163651,
        "tc": 144246869,
        "tiles": 849814418,
      }
    `);
    o.update(2, 40, 20, 0.4, obs, 1, 0.6, 9);
    expect(state(o)).toMatchInlineSnapshot(`
      {
        "bc": 277270840,
        "blocks": 875806446,
        "tc": 122401910,
        "tiles": 110842859,
      }
    `);
  });

  it('draws nothing when hidden and keeps the grid when revealed again', () => {
    const o = new Occupancy();
    o.update(0, 0, 0, 0, obs, 1, 0);
    expect(o.group.visible).toBe(false);
    o.update(0, 0, 0, 0, obs, 0, 1);
    expect(Math.max(...o.tiles.instanceMatrix.array.filter((_, i) => i % 16 === 0))).toBe(0);
  });

  it('builds the route ribbon from the route function and from a plan', () => {
    const o = new Occupancy();
    o.route = (x) => Math.sin(x * 0.05) * 10;
    o.update(0, 0, 0, 0, obs, 1, 1);
    expect(pathOf(o)).toMatchInlineSnapshot(`
      {
        "idx": [
          0,
          1,
          2,
          1,
          3,
          2,
          2,
          3,
          4,
          3,
          5,
          4,
        ],
        "n": 270,
        "pos": 529564625,
        "u": 2797564,
      }
    `);
    o.plan = [new THREE.Vector3(0, 1, 0), new THREE.Vector3(10, 1, 4), new THREE.Vector3(20, 1, 0)];
    o.update(0, 0, 0, 0, obs, 1, 1);
    expect(pathOf(o)).toMatchInlineSnapshot(`
      {
        "idx": [
          0,
          1,
          2,
          1,
          3,
          2,
          2,
          3,
          4,
          3,
          5,
          4,
        ],
        "n": 12,
        "pos": 880440,
        "u": 9668,
      }
    `);
    o.route = () => 0; o.plan = null;
    o.update(0, 0, 0, 0, obs, 1, 1);
    expect(pathOf(o).n).toBe(45 * 6);
  });

  it('reuses the ribbon buffers every frame and grows them for a longer plan', () => {
    const o = new Occupancy(), g = o.path.geometry;
    o.update(0, 0, 0, 0, obs, 1, 1);
    const pos = g.getAttribute('position'), idx = g.index;
    o.update(1, 5, 0, 0, obs, 1, 1);
    expect(g.getAttribute('position')).toBe(pos);
    expect(g.index).toBe(idx);
    o.plan = Array.from({ length: 200 }, (_, i) => new THREE.Vector3(i, 1, 0));
    o.update(2, 5, 0, 0, obs, 1, 1);
    expect(g.drawRange.count).toBe(199 * 6);
    expect(g.getAttribute('position').count).toBeGreaterThanOrEqual(400);
  });
});
