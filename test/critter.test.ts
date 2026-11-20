import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { Critter, EXPRESSIONS, blinking, secondary } from '../src/critter';

const ctx = new Proxy({}, { get: (_t, k) => (/Gradient$/.test(String(k)) ? () => ({ addColorStop: () => {} }) : () => undefined), set: () => true });
vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) });

describe('critter', () => {
  it('secondary motion is pure, still tail-heavy when moving and quieter at rest', () => {
    expect(secondary(3.3, 1.2, 1)).toEqual(secondary(3.3, 1.2, 1));
    const swing = (e: number) => Math.max(...Array.from({ length: 200 }, (_, i) => Math.abs(secondary(i * 0.05, 0, e).tail2)));
    expect(swing(1)).toBeGreaterThan(swing(0));
    expect(secondary(0, 0, 0, 0.3).antenna.z).toBeCloseTo(-0.27, 6);
  });

  it('the second tail segment trails the first by a fixed phase', () => {
    const fl = 0.25 + 0.5, t = 1;
    expect(secondary(t, 0, 1).tail2).toBeCloseTo(0.5 * fl * Math.sin(5 * t - 1.1), 9);
    expect(secondary(t, 0, 1).tail.z).toBeCloseTo(0.5 + 0.3 * fl * Math.sin(5 * t), 9);
  });

  it('blinks briefly and not for long', () => {
    const closed = Array.from({ length: 4000 }, (_, i) => blinking(i * 0.01, 0)).filter(Boolean).length;
    expect(closed).toBeGreaterThan(0);
    expect(closed).toBeLessThan(400);
  });

  it('poses a face by expression, moves where asked and blinks into the sleep face', () => {
    const c = new Critter('pip', 0x2288ff, 2);
    c.pose({ p: new THREE.Vector3(1, 2, 3), t: 0.4, expr: 'love', bob: 0 });
    expect(c.root.position.toArray()).toEqual([1, 2, 3]);
    const tex = (c as unknown as { texture: THREE.Texture }).texture;
    expect(tex!.offset.x).toBeCloseTo(EXPRESSIONS.indexOf('love') / EXPRESSIONS.length, 9);
    const t = Array.from({ length: 4000 }, (_, i) => i * 0.01).find((x) => blinking(x, c.seed))!;
    c.pose({ p: new THREE.Vector3(), t, expr: 'open' });
    expect(tex!.offset.x).toBeCloseTo(EXPRESSIONS.indexOf('sleep') / EXPRESSIONS.length, 9);
  });
});
