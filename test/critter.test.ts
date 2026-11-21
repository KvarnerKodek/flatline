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

  it('arms are jointed: the forearm lags the upper arm, bends at the elbow and the hands stay where a hand should', () => {
    const c = new Critter('pip', 0x2288ff, 1), p = { p: new THREE.Vector3(), expr: 'open' as const, arms: 0.8 };
    type Rig = { armL: THREE.Group; armR: THREE.Group; elbowL: THREE.Group; elbowR: THREE.Group };
    const r = c as unknown as Rig;
    expect(r.elbowL.parent).toBe(r.armL);
    const up = Array.from({ length: 60 }, (_, i) => { c.pose({ ...p, t: i * 0.05 }); return [r.armR.rotation.z, r.elbowR.rotation.z]; });
    const swing = (k: number) => Math.max(...up.map((v) => v[k])) - Math.min(...up.map((v) => v[k]));
    expect(swing(1)).toBeGreaterThan(0.05);
    const first = (k: number) => up.findIndex((v, i) => i && (v[k] - up[i - 1][k]) * (up[1][k] - up[0][k]) < 0);
    expect(first(1)).not.toBe(first(0));
    c.pose({ ...p, t: 1, arms: 0.15 });
    c.root.updateMatrixWorld(true);
    const hand = new THREE.Vector3().setFromMatrixPosition(r.elbowL.children[r.elbowL.children.length - 1].matrixWorld);
    expect(hand.y).toBeLessThan(0.16);
    expect(Math.abs(hand.x)).toBeGreaterThan(0.3);
    expect(r.elbowL.rotation.z * r.elbowR.rotation.z).toBeLessThan(0);
  });
});
