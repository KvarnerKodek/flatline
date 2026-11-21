import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { pathLength, blink, eyeDart, hop, overlap, spring, squashStretch, travelYaw, weightShift } from '../src/motion';

const range = <T>(n: number, f: (i: number) => T) => Array.from({ length: n }, (_, i) => f(i));

describe('spring', () => {
  it('rests at 0 before and settles on 1, overshooting by the damping ratio', () => {
    expect(spring(-1)).toBe(0);
    expect(spring(0)).toBeCloseTo(0, 9);
    expect(spring(20)).toBeCloseTo(1, 4);
    const peak = Math.max(...range(2000, (i) => spring(i * 0.002, { damp: 0.3 })));
    expect(peak).toBeCloseTo(1 + Math.exp((-Math.PI * 0.3) / Math.sqrt(1 - 0.09)), 3);
    expect(Math.max(...range(2000, (i) => spring(i * 0.002, { damp: 1 })))).toBeLessThanOrEqual(1);
  });
});

describe('overlap', () => {
  it('samples a driver later for each successive part, so the tip trails the root', () => {
    const drive = (t: number) => Math.sin(t);
    const [a, b, c] = overlap(drive, 2, 0.1, 3);
    expect([a, b, c]).toEqual([drive(2), drive(1.9), drive(1.8)]);
  });
});

describe('squash and stretch', () => {
  it('keeps volume constant for any stretch', () => {
    for (const s of [-0.4, -0.1, 0, 0.2, 0.6]) { const [x, y, z] = squashStretch(s); expect(x * y * z).toBeCloseTo(1, 9); expect(y).toBeCloseTo(1 + s, 9); }
  });
  it('a hop crouches before takeoff, stretches in the air and squashes on landing, never going below the ground', () => {
    const h = (t: number) => hop(t, 1, 0.6, 0.5), over = (a: number, b: number, f: (s: number) => number) => range(200, (i) => f(h(a + ((b - a) * i) / 199).squash));
    expect(h(0.5)).toEqual({ y: 0, squash: 0 });
    expect(h(3)).toEqual({ y: 0, squash: 0 });
    expect(Math.min(...over(1, 1.12, (s) => s))).toBeLessThan(-0.1);
    expect(Math.max(...over(1.12, 1.48, (s) => s))).toBeGreaterThan(0.05);
    expect(Math.min(...over(1.48, 1.6, (s) => s))).toBeLessThan(-0.1);
    const ys = range(400, (i) => h(0.5 + i * 0.005).y);
    expect(Math.min(...ys)).toBe(0);
    expect(Math.max(...ys)).toBeCloseTo(0.5, 2);
  });
});

describe('eyes', () => {
  it('blinks every few seconds, a few frames each, at different times for different seeds, as a pure function of time', () => {
    const shut = (seed: number) => range(30 * 40, (i) => blink(i / 30, seed) > 0.5);
    const runs = (s: boolean[]) => s.reduce((n, v, i) => n + (v && !s[i - 1] ? 1 : 0), 0);
    const a = shut(1), b = shut(2);
    expect(runs(a)).toBeGreaterThanOrEqual(6);
    expect(runs(a)).toBeLessThanOrEqual(22);
    expect(a.join()).not.toEqual(b.join());
    expect(blink(7.7, 3)).toBe(blink(7.7, 3));
    expect(Math.min(...range(1200, (i) => blink(i / 30, 1)))).toBe(0);
    expect(Math.max(...range(1200, (i) => blink(i / 30, 1)))).toBeLessThanOrEqual(1);
  });

  it('darts to a new fixation within a few frames, then holds still', () => {
    const p = range(30 * 20, (i) => eyeDart(i / 30, 4).x);
    const steps = p.map((v, i) => Math.abs(v - (p[i - 1] ?? v)));
    expect(Math.max(...steps)).toBeGreaterThan(0.1);
    expect(p.filter((_, i) => steps[i] < 0.01).length).toBeGreaterThan(p.length * 0.5);
    expect(Math.max(...p.map(Math.abs))).toBeLessThanOrEqual(1);
  });
});

describe('weight shift', () => {
  it('drifts slowly between -1 and 1 and differs by seed', () => {
    const w = range(600, (i) => weightShift(i * 0.1, 1));
    expect(Math.max(...w)).toBeLessThanOrEqual(1);
    expect(Math.min(...w)).toBeGreaterThanOrEqual(-1);
    expect(Math.max(...w.map((v, i) => Math.abs(v - (w[i - 1] ?? v))))).toBeLessThan(0.2);
    expect(weightShift(3, 1)).not.toBe(weightShift(3, 2));
  });
});

describe('travelYaw', () => {
  const path = (t: number) => new THREE.Vector3(Math.cos(t * 0.5) * 6, 0, Math.sin(t * 0.5) * 6);
  it('points the +x forward axis along the travel direction everywhere on a curved path', () => {
    for (let t = 0; t < 20; t += 0.37) {
      const yaw = travelYaw(path, t), fwd = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw)), v = path(t + 0.01).sub(path(t - 0.01)).normalize();
      expect(fwd.dot(v)).toBeGreaterThan(0.995);
    }
  });
  it('keeps the last heading while standing still instead of snapping back', () => {
    const stop = (t: number) => new THREE.Vector3(Math.min(t, 4) * 2, 0, Math.min(t, 4) * 1);
    const moving = travelYaw(stop, 3), still = travelYaw(stop, 9);
    expect(still).toBeCloseTo(moving, 6);
  });
  it('is the same going out as going back along a path reversed (never walks backwards)', () => {
    const out = (t: number) => new THREE.Vector3(t, 0, 0), back = (t: number) => new THREE.Vector3(-t, 0, 0);
    expect(Math.cos(travelYaw(out, 2))).toBeGreaterThan(0.99);
    expect(Math.cos(travelYaw(back, 2))).toBeLessThan(-0.99);
  });
});

describe('pathLength', () => {
  it('measures the ground distance walked', () => {
    expect(pathLength((t) => new THREE.Vector3(2 * t, 9, 0), 5)).toBeCloseTo(10, 6);
    expect(pathLength((t) => new THREE.Vector3(Math.cos(t), 0, Math.sin(t)), Math.PI)).toBeCloseTo(Math.PI, 2);
    expect(pathLength((t) => new THREE.Vector3(t, 0, 0), 0)).toBe(0);
  });
});
