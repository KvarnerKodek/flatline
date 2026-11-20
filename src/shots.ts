import * as THREE from 'three';
import { ss, type CameraShot } from './timeline';

/**
 * One camera setup. It owns the film from `t0` until the next shot's `t0`; `u` runs 0 to 1 across it and `s` is
 * seconds since it began. Shots cut hard unless a fade is asked for.
 */
export interface Shot {
  t0: number;
  name?: string;
  fadeIn?: number;
  fadeOut?: number;
  cam(c: CameraShot, u: number, s: number, t: number): void;
}

export interface ShotAt { index: number; shot: Shot; u: number; s: number; length: number }

export function shotAt(shots: Shot[], duration: number, t: number): ShotAt {
  let i = 0;
  while (i < shots.length - 1 && t >= shots[i + 1].t0) i++;
  const shot = shots[i], end = i < shots.length - 1 ? shots[i + 1].t0 : duration;
  const length = end - shot.t0, s = Math.min(length, Math.max(0, t - shot.t0));
  return { index: i, shot, u: length > 0 ? s / length : 0, s, length };
}

/** Fade to black owed at `t`: 1 at a shot edge that asked for a fade, 0 in the clear. */
export function shotFade(a: ShotAt): number {
  const i = a.shot.fadeIn ? 1 - ss(0, a.shot.fadeIn, a.s) : 0;
  const o = a.shot.fadeOut ? ss(a.length - a.shot.fadeOut, a.length, a.s) : 0;
  return Math.max(i, o);
}

/** Runs the shot that owns `t`, writes the camera and returns the shot with its fade. */
export function cutTrack(shots: Shot[], duration: number) {
  return (t: number, c: CameraShot): ShotAt & { fade: number } => {
    const a = shotAt(shots, duration, t);
    a.shot.cam(c, a.u, a.s, t);
    return { ...a, fade: shotFade(a) };
  };
}

/** Problems in a shot list that only show up as a frozen or missing picture. */
export function checkShots(shots: Shot[], duration: number, minLength = 1.2): string[] {
  const out: string[] = [];
  if (!shots.length || shots[0].t0 !== 0) out.push('shots must start at 0');
  shots.forEach((s, i) => {
    const end = i < shots.length - 1 ? shots[i + 1].t0 : duration, label = s.name ?? `#${i}`;
    if (end <= s.t0) out.push(`shot "${label}" is out of order`);
    else if (end - s.t0 < minLength) out.push(`shot "${label}" is shorter than ${minLength} s`);
    if ((s.fadeIn ?? 0) + (s.fadeOut ?? 0) > end - s.t0) out.push(`shot "${label}" fades for longer than it lasts`);
  });
  return out;
}

/** Straight move from one position and target to another. */
export function dolly(c: CameraShot, u: number, p0: THREE.Vector3, p1: THREE.Vector3, l0: THREE.Vector3, l1: THREE.Vector3) {
  c.p.lerpVectors(p0, p1, u);
  c.look.lerpVectors(l0, l1, u);
}

/** Circle a point: angle `a` in the x/z plane, at `radius` and `height` above the centre. */
export function orbit(c: CameraShot, centre: THREE.Vector3, a: number, radius: number, height: number) {
  c.p.set(centre.x + Math.cos(a) * radius, centre.y + height, centre.z + Math.sin(a) * radius);
  c.look.copy(centre);
}

/** A breathing, hand-held drift so a locked-off shot never looks frozen. Pure in `t`. */
export function drift(c: CameraShot, t: number, amount = 1) {
  c.p.x += (Math.sin(t * 0.37) + Math.sin(t * 0.83 + 1.7) * 0.5) * 0.05 * amount;
  c.p.y += (Math.sin(t * 0.53 + 0.4) + Math.sin(t * 1.07) * 0.4) * 0.035 * amount;
  c.look.y += Math.sin(t * 0.61 + 2.1) * 0.03 * amount;
}
