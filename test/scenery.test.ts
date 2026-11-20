import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  const ctx = { createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, fillStyle: '' };
  (globalThis as unknown as { document: unknown }).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
});

import { makeClouds } from '../src/clouds';
import { makeBirds } from '../src/birds';
import { waterlineFoam } from '../src/props';
import * as THREE from 'three';

const snap = (g: THREE.Group) => g.children.map((c) => c.position.toArray().map((v) => v.toFixed(4)).join(','));

describe('scenery is a pure function of time', () => {
  it('clouds land on the same positions regardless of the order times are asked in', () => {
    const c = makeClouds(6, 5);
    c.update(40, 1);
    const a = snap(c.group);
    c.update(900, 1);
    c.update(40, 1);
    expect(snap(c.group)).toEqual(a);
  });

  it('birds flap and circle deterministically and hide when not visible', () => {
    const b = makeBirds(4, 2);
    const centre = new THREE.Vector3(10, 0, -5);
    b.update(12, centre, 1);
    const a = snap(b.group);
    b.update(300, centre, 1);
    b.update(12, centre, 1);
    expect(snap(b.group)).toEqual(a);
    b.update(12, centre, 0);
    expect(b.group.visible).toBe(false);
  });

  it('foam collars sit at the waterline and scale with the hull', () => {
    const f = waterlineFoam(10, 3);
    expect(f.children.length).toBe(2);
    for (const m of f.children) expect(m.position.y).toBeLessThan(0);
    expect(f.children[1].scale.x).toBeCloseTo(f.children[0].scale.x, 9);
  });
});
