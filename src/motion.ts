import * as THREE from 'three';
import { clamp, ss } from './timeline';

/**
 * The principles of animation as closed-form functions of time. Nothing here keeps state, so any frame can be
 * evaluated alone and in any order.
 */

const fract = (x: number) => x - Math.floor(x);
const hash = (x: number) => fract(Math.sin(x * 127.1 + 311.7) * 43758.5453);

export interface SpringOpts { /** Natural frequency in radians per second. */ freq?: number; /** Damping ratio: 0 rings for ever, 1 settles without overshoot. */ damp?: number }

/** Unit step response of a damped spring started at t = 0: 0 before, overshoots 1 and settles on it (follow-through and overshoot). */
export function spring(t: number, { freq = 12, damp = 0.4 }: SpringOpts = {}): number {
  if (t <= 0) return 0;
  const z = Math.min(damp, 0.9999), wd = freq * Math.sqrt(1 - z * z), e = Math.exp(-z * freq * t);
  return damp >= 1 ? 1 - Math.exp(-freq * t) * (1 + freq * t) : 1 - e * (Math.cos(wd * t) + ((z * freq) / wd) * Math.sin(wd * t));
}

/** `n` samples of `drive` each `lag` seconds later than the last: the root of a chain leads and every part behind it trails (overlapping action). */
export const overlap = (drive: (t: number) => number, t: number, lag: number, n: number): Array<number> => Array.from({ length: n }, (_, i) => drive(t - i * lag));

/** Volume-preserving scale for a stretch `s` along y (positive stretches, negative squashes): `[x, y, z]`. */
export const squashStretch = (s: number): [number, number, number] => { const x = 1 / Math.sqrt(1 + s); return [x, 1 + s, x]; };

/**
 * A hop from `t0` over `dur` seconds: a crouch (anticipation), a launch that stretches, a parabolic arc `height` high, then a
 * squash on landing that settles. `y` is the lift in metres and `squash` the stretch for `squashStretch`.
 */
export function hop(t: number, t0: number, dur: number, height: number): { y: number; squash: number } {
  const u = (t - t0) / dur;
  if (u <= 0 || u >= 1) return { y: 0, squash: 0 };
  if (u < 0.2) return { y: 0, squash: -0.18 * Math.sin((u / 0.2) * Math.PI * 0.5) };
  if (u < 0.8) { const a = (u - 0.2) / 0.6; return { y: 4 * a * (1 - a) * height, squash: -0.18 * (1 - ss(0, 0.15, a)) + 0.14 * Math.sin(Math.PI * a) * (1 - a * 0.3) }; }
  const b = (u - 0.8) / 0.2;
  return { y: 0, squash: -0.22 * (1 - b) * Math.cos(b * Math.PI * 1.5) };
}

/** Eyelid closure from 0 (open) to 1 (shut): one quick blink every few seconds at a time of its own for each `seed`, and now and then a double. */
export function blink(t: number, seed: number): number {
  const period = 3.4, beat = t / period + hash(seed), k = Math.floor(beat), at = (fract(beat) - 0.3 * hash(k + seed * 3)) * period;
  const one = (s: number) => (s > 0 && s < 0.18 ? Math.sin((s / 0.18) * Math.PI) : 0);
  return Math.max(one(at), hash(k * 1.7 + seed) < 0.25 ? one(at - 0.3) : 0);
}

/** Where the eyes look, each axis -1 to 1: they hold a fixation for a second or so, then dart to the next in a few frames (a saccade). */
export function eyeDart(t: number, seed: number): { x: number; y: number } {
  const hold = 0.7 + 0.5 * hash(seed), n = t / hold + hash(seed + 5), k = Math.floor(n), u = (fract(n) * hold) / 0.09;
  const at = (i: number) => ({ x: (hash(i + seed * 7) - 0.5) * 2 * (hash(i * 3.1 + seed) < 0.5 ? 0.45 : 1), y: (hash(i + seed * 3 + 9) - 0.5) * 1.2 });
  const a = at(k - 1), b = at(k), e = ss(0, 1, clamp(u));
  return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e };
}

/** A slow drift between -1 and 1 for shifting weight from one foot to the other, out of step between seeds. */
export const weightShift = (t: number, seed: number) => Math.sin(t * 0.37 + seed) * 0.6 + Math.sin(t * 0.83 + seed * 2) * 0.4;

/**
 * Heading of a thing travelling along `at(t)`, as the yaw whose forward `(cos yaw, 0, sin yaw)` points along the motion (`rotation.y = -yaw`
 * for something modelled facing +x). It smooths the velocity over `window` seconds so corners turn rather than snap, and when the
 * thing stands still it keeps the heading it last had instead of snapping back.
 */
export function travelYaw(at: (t: number) => THREE.Vector3, t: number, { window = 0.5, eps = 1e-3 }: { window?: number; eps?: number } = {}): number {
  for (let i = 0; i < 64; i++) {
    const c = t - i * window;
    if (c < -window) break;
    const dx = at(c + window / 2).x - at(c - window / 2).x, dz = at(c + window / 2).z - at(c - window / 2).z;
    if (Math.hypot(dx, dz) > eps * window) return Math.atan2(dz, dx);
  }
  return 0;
}

/** Ground distance walked along `at` from time 0 to `t`, summed over at most `steps` chords (fine for any smooth path). */
export function pathLength(at: (t: number) => THREE.Vector3, t: number, steps = 240): number {
  const n = Math.max(1, Math.min(steps, Math.ceil(t * 15)));
  let sum = 0, prev = at(0).clone();
  for (let i = 1; i <= n; i++) { const p = at((t * i) / n); sum += Math.hypot(p.x - prev.x, p.z - prev.z); prev.copy(p); }
  return t > 0 ? sum : 0;
}
