import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { bezier, checkScript, clamp, ease, outBack, pulse, ramp, shiftCamera, smoother, ss, V } from '../src/timeline';
import { DAWN, DAY, NIGHT, mixMood, moodTrack } from '../src/mood';
import { Placed, place } from '../src/bob';
import { waveHeight } from '../src/water';

describe('timeline helpers', () => {
  it('ease and smoothstep run from 0 to 1 without overshoot', () => {
    let prev = -1;
    for (let i = 0; i <= 50; i++) {
      const e = ease(i / 50), s = ss(0, 1, i / 50);
      expect(e).toBeGreaterThanOrEqual(prev);
      expect(e).toBeLessThanOrEqual(1);
      expect(s).toBeGreaterThanOrEqual(0);
      prev = e;
    }
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(clamp(5)).toBe(1);
  });

  it('shifts the camera and its target together so the framing is only translated', () => {
    const c = { p: V(0, 5, 10), look: V(0, 0, 0), fov: 40 };
    const before = c.p.distanceTo(c.look);
    shiftCamera(c, 3);
    expect(c.p.distanceTo(c.look)).toBeCloseTo(before, 6);
    expect(Math.abs(c.p.x)).toBeCloseTo(3, 6);
  });
});

describe('moods', () => {
  it('blends to the first mood before a key and to the second after it', () => {
    const at = moodTrack([{ t: 0, mood: NIGHT }, { t: 50, mood: DAY }], 10);
    expect(at(0).night).toBe(1);
    expect(at(44).night).toBe(1);
    expect(at(56).night).toBe(0);
    const mid = at(50).night;
    expect(mid).toBeGreaterThan(0.2);
    expect(mid).toBeLessThan(0.8);
  });

  it('mixing never mutates its inputs and keeps the light direction unit length', () => {
    const n0 = NIGHT.fogD, d0 = DAWN.lightDir.clone();
    const m = mixMood(NIGHT, DAWN, 0.5);
    expect(NIGHT.fogD).toBe(n0);
    expect(DAWN.lightDir.equals(d0)).toBe(true);
    expect(m.lightDir.length()).toBeCloseTo(1, 6);
  });
});

describe('floating things', () => {
  it('rides the swell the water draws', () => {
    const p = new Placed(new THREE.Object3D(), 10);
    place(p, { x: 12, z: -4, yaw: 0.3, speed: 2 }, 7, 1);
    expect(p.obj.position.y).toBeCloseTo(waveHeight(12, -4, 7, 1), 9);
    place(p, { x: 12, z: -4, yaw: 0.3, speed: 2 }, 7, 0);
    expect(p.obj.position.y).toBeCloseTo(0, 9);
  });
});

describe('script checks', () => {
  const ok = { duration: 30, captions: [{ t0: 1, t1: 8, k: 'a', h: 'One' }, { t0: 9, t1: 15, k: 'b', h: 'Two' }], chapters: [{ t: 0, name: 'x' }, { t: 9, name: 'y' }] };
  it('accepts a clean script', () => expect(checkScript(ok)).toEqual([]));
  it('names every kind of defect', () => {
    const bad = { duration: 10, captions: [{ t0: 1, t1: 3, k: 'a', h: 'Short' }, { t0: 2.5, t1: 12, k: 'b', h: 'Over—lap' }], chapters: [{ t: 1, name: 'late' }] };
    const problems = checkScript(bad).join('\n');
    expect(problems).toMatch(/shorter than/);
    expect(problems).toMatch(/overlaps/);
    expect(problems).toMatch(/leaves the film/);
    expect(problems).toMatch(/dash/);
    expect(problems).toMatch(/start at 0/);
  });

  it('ramps, pulses and pops stay in range and hit their end points', () => {
    expect(ramp(5, 0, 10)).toBe(0.5);
    expect(ramp(-1, 0, 10)).toBe(0);
    expect(smoother(0)).toBe(0);
    expect(smoother(1)).toBe(1);
    expect(smoother(0.5)).toBeCloseTo(0.5, 9);
    expect(pulse(0, 1, 5)).toBe(0);
    expect(pulse(3, 1, 5)).toBe(1);
    expect(pulse(6, 1, 5)).toBe(0);
    expect(outBack(0)).toBeCloseTo(0, 9);
    expect(outBack(1)).toBeCloseTo(1, 9);
    expect(Math.max(...Array.from({ length: 21 }, (_, i) => outBack(i / 20)))).toBeGreaterThan(1);
  });

  it('a Bezier starts and ends on its points and bends towards the control point', () => {
    const a = V(0, 0, 0), b = V(10, 0, 0), c = V(5, 10, 0);
    expect(bezier(a, c, b, 0).distanceTo(a)).toBe(0);
    expect(bezier(a, c, b, 1).distanceTo(b)).toBe(0);
    expect(bezier(a, c, b, 0.5).y).toBeCloseTo(5, 9);
  });
});
