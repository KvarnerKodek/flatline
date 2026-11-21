import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Inst } from '../src/instanced';
import { Obstacle, Occupancy } from '../src/occupancy';
import { bench, budget } from './bench';

const obs: Array<Obstacle> = Array.from({ length: 40 }, (_, i) => ({ x: (i * 37) % 280 - 140, z: (i * 53) % 260 - 130, r: 2 + (i % 5), h: 3 + (i % 7) }));

describe('perf budgets', () => {
  it('occupancy grid update', () => {
    const o = new Occupancy();
    expect(bench('occupancy.update', 200, (i) => o.update(i, i * 0.37, i * 0.21, 0, obs, 1, 1))).toBeLessThan(budget(0.6));
  });

  it('instanced set and commit', () => {
    const inst = new Inst(new THREE.BoxGeometry(1, 1, 1), 10000, { colors: true });
    expect(bench('inst.set x10000', 50, (k) => { for (let i = 0; i < 10000; i++) { inst.set(i, i, k, i, k * 0.1, 1, 2, 1); inst.color(i, 0xff8040); } inst.commit(); })).toBeLessThan(budget(0.9));
  });
});
