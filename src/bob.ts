import * as THREE from 'three';
import { waveHeight } from './water';

/** Height of whatever the object floats or rests on at a world point. */
export type Surface = (x: number, z: number, t: number) => number;

export interface Pose { x: number; z: number; yaw: number; speed: number }

/** Something that floats: it keeps its own pose and rides the same swell the water draws. */
export class Placed {
  pose: Pose = { x: 0, z: 0, yaw: 0, speed: 0 };
  lift = 0;
  constructor(public obj: THREE.Object3D, public length: number) {}
}

/** Rest an object on any surface (a sea, a meadow, a conveyor): position follows the surface, pitch and roll follow its slope. */
/** `yaw` is a heading in the x/z plane: forward is (cos yaw, sin yaw). */
export function placeOn(p: Placed, pose: Pose, t: number, surface: Surface, draft = 0) {
  p.pose = pose;
  const L = p.length * 0.45, W = Math.max(1, p.length * 0.18);
  const c = Math.cos(pose.yaw), s = Math.sin(pose.yaw);
  const h = (a: number, b: number) => surface(pose.x + c * a - s * b, pose.z + s * a + c * b, t);
  const hc = h(0, 0), hf = h(L, 0), ha = h(-L, 0), hp = h(0, -W), hs = h(0, W);
  p.obj.position.set(pose.x, hc + draft + p.lift, pose.z);
  p.obj.rotation.order = 'YZX';
  p.obj.rotation.set(0, 0, 0);
  p.obj.rotation.y = -pose.yaw;
  p.obj.rotation.z = Math.atan2(hf - ha, 2 * L);
  p.obj.rotation.x = Math.atan2(hs - hp, 2 * W) * -1;
}

/** The sea flavour of `placeOn`, kept for existing films. */
export const place = (p: Placed, pose: Pose, t: number, sea: number, draft = 0) => placeOn(p, pose, t, (x, z, tt) => waveHeight(x, z, tt, sea), draft);

export interface Seat { y: number; pitch: number; roll: number }

export interface SeatOptions {
  /** Half length and half width of the footprint in metres. */
  half: { l: number; w: number };
  /** Gap kept above the highest footprint point. */
  lift?: number;
  t?: number;
}

/**
 * Pitch, roll and height that seat a footprint on a surface: the plane is fitted to the four corners, then raised
 * until no point of a 5 by 3 grid across the footprint is buried. Apply as `rotation.set(roll, -yaw, pitch)` in order `YZX`.
 */
export function seatPose(surface: Surface, pose: Pick<Pose, 'x' | 'z' | 'yaw'>, { half, lift = 0.1, t = 0 }: SeatOptions): Seat {
  const c = Math.cos(pose.yaw), s = Math.sin(pose.yaw);
  const h = (a: number, b: number) => surface(pose.x + c * a * half.l - s * b * half.w, pose.z + s * a * half.l + c * b * half.w, t);
  const front = h(1, -1) + h(1, 1), back = h(-1, -1) + h(-1, 1), right = h(-1, 1) + h(1, 1), left = h(-1, -1) + h(1, -1);
  const pitch = Math.atan2((front - back) / 2, 2 * half.l), roll = -Math.atan2((right - left) / 2, 2 * half.w), y0 = (front + back) / 4;
  const kp = Math.tan(pitch), kr = Math.tan(roll);
  const worst = Math.max(...[-1, -0.5, 0, 0.5, 1].flatMap((a) => [-1, 0, 1].map((b) => h(a, b) - (y0 + a * half.l * kp - b * half.w * kr))));
  return { y: y0 + Math.max(0, worst) + lift, pitch, roll };
}

/** Seats `obj` with `seatPose`: a lorry or cart that follows the ground without sinking a wheel into it. */
export function seatOn(obj: THREE.Object3D, surface: Surface, pose: Pose, o: SeatOptions) {
  const q = seatPose(surface, pose, o);
  obj.position.set(pose.x, q.y, pose.z);
  obj.rotation.order = 'YZX';
  obj.rotation.set(q.roll, -pose.yaw, q.pitch);
}
