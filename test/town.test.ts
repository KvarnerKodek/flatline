import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

vi.hoisted(() => {
  const ctx = { createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, fillStyle: '' };
  (globalThis as unknown as { document: unknown }).document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
});

import { house } from '../src/town';

describe('houses', () => {
  it('never let a wall, a gable or cladding poke through the roof, at any pitch, eave or height', () => {
    for (const pitch of [0.35, 0.5, 0.65]) for (const eave of [0.3, 0.7, 1.3]) for (const storeys of [1, 2, 3]) for (const upper of [undefined, 0x7a4f32]) {
      const w = 7, d = 6, hs = house({ w, d, pitch, eave, storeys, upper, chimney: false });
      const p = (hs.root.children[0] as THREE.Mesh).geometry.getAttribute('position');
      let ridge = -Infinity;
      for (let i = 0; i < p.count; i++) ridge = Math.max(ridge, p.getY(i));
      const k = pitch * 1.6, ex = w / 2 + eave, ez = d / 2 + eave;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i);
        if (Math.abs(x) <= ex + 1e-6 && Math.abs(z) <= ez + 1e-6) expect(p.getY(i)).toBeLessThanOrEqual(ridge - k * Math.abs(z) + 1e-4);
      }
      expect(ridge).toBeCloseTo(hs.height, 6);
    }
  });
});
