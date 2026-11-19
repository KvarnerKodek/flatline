import * as THREE from 'three';
import { waveHeight } from './water';

export interface Pose { x: number; z: number; yaw: number; speed: number }

/** Something that floats: it keeps its own pose and rides the same swell the water draws. */
export class Placed {
  pose: Pose = { x: 0, z: 0, yaw: 0, speed: 0 };
  lift = 0;
  constructor(public obj: THREE.Object3D, public length: number) {}
}

/** `yaw` is a heading in the x/z plane: forward is (cos yaw, sin yaw). */
export function place(p: Placed, pose: Pose, t: number, sea: number, draft = 0) {
  p.pose = pose;
  const L = p.length * 0.45, W = Math.max(1, p.length * 0.18);
  const c = Math.cos(pose.yaw), s = Math.sin(pose.yaw);
  const h = (a: number, b: number) => waveHeight(pose.x + c * a - s * b, pose.z + s * a + c * b, t, sea);
  const hc = h(0, 0), hf = h(L, 0), ha = h(-L, 0), hp = h(0, -W), hs = h(0, W);
  p.obj.position.set(pose.x, hc + draft + p.lift, pose.z);
  p.obj.rotation.order = 'YZX';
  p.obj.rotation.set(0, 0, 0);
  p.obj.rotation.y = -pose.yaw;
  p.obj.rotation.z = Math.atan2(hf - ha, 2 * L);
  p.obj.rotation.x = Math.atan2(hs - hp, 2 * W) * -1;
}
