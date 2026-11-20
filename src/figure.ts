import * as THREE from 'three';
import { toon, outline } from './toon';

const INK = outline(1.7);
const mats = new Map<number, THREE.ShaderMaterial>();
const mat = (c: number) => mats.get(c) ?? (mats.set(c, toon({ color: c, spec: 0 })), mats.get(c)!);
const SHADOW = new THREE.MeshBasicMaterial({ color: 0x08121c, transparent: true, opacity: 0.26, depthWrite: false });

function part(parent: THREE.Object3D, g: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0): THREE.Group {
  const p = new THREE.Group();
  p.add(new THREE.Mesh(g, mat(color)), new THREE.Mesh(g, INK));
  p.position.set(x, y, z);
  parent.add(p);
  return p;
}

function shadow(parent: THREE.Object3D, rx: number, rz: number) {
  const s = new THREE.Mesh(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), SHADOW);
  s.scale.set(rx, 1, rz);
  s.position.y = 0.03;
  s.renderOrder = 2;
  parent.add(s);
}

export interface FigureOpts { skin?: number; coat?: number; legs?: number; hair?: number; hat?: number; scarf?: number; dress?: boolean; apron?: number; build?: number }
export interface FigurePose { walk?: number; stride?: number; armL?: number; armR?: number; reachL?: number; reachR?: number; headYaw?: number; headPitch?: number; bow?: number }

export interface Figure { root: THREE.Group; hand: THREE.Object3D; pose(p: FigurePose): void }

/**
 * A small articulated person, 1.7 m tall, feet at the origin, facing +x. Proportions are storybook: a large
 * head and simple limbs, so it reads at the distances a wide shot is held at.
 */
export function figure(o: FigureOpts = {}): Figure {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  shadow(root, 0.42, 0.34);
  const skin = o.skin ?? 0xf0c8a0, coat = o.coat ?? 0x3d6f9e, legC = o.legs ?? 0x3a3f4a, b = o.build ?? 1;
  const hips = 0.82;
  const leg = (s: number) => {
    const g = new THREE.Group();
    g.position.set(0, hips, s * 0.11);
    part(g, new THREE.CapsuleGeometry(0.085, 0.58, 3, 8).translate(0, -0.4, 0), legC);
    part(g, new THREE.SphereGeometry(0.1, 8, 6).scale(1.5, 0.7, 1).translate(0.05, -0.78, 0), 0x4a3526);
    body.add(g);
    return g;
  };
  const legL = leg(-1), legR = leg(1);
  const torso = new THREE.Group();
  torso.position.y = hips;
  body.add(torso);
  part(torso, new THREE.CylinderGeometry(0.19 * b, (o.dress ? 0.4 : 0.26) * b, o.dress ? 0.98 : 0.66, 12).translate(0, o.dress ? 0.17 : 0.33, 0), coat);
  if (o.apron !== undefined) part(torso, new THREE.CylinderGeometry(0.218 * b, 0.285 * b, 0.6, 10, 1, false, Math.PI / 2 - 0.85, 1.7).translate(0, 0.3, 0), o.apron);
  const arm = (s: number) => {
    const g = new THREE.Group();
    g.position.set(0, 0.6, s * 0.25 * b);
    part(g, new THREE.CapsuleGeometry(0.065, 0.44, 3, 8).translate(0, -0.27, 0), coat);
    const hand = part(g, new THREE.SphereGeometry(0.075, 8, 6), skin, 0, -0.56, 0);
    torso.add(g);
    return { g, hand };
  };
  const aL = arm(-1), aR = arm(1);
  if (o.scarf !== undefined) part(torso, new THREE.TorusGeometry(0.15, 0.065, 6, 12).rotateX(Math.PI / 2), o.scarf, 0, 0.68, 0);
  const head = new THREE.Group();
  head.position.y = 0.92;
  torso.add(head);
  part(head, new THREE.SphereGeometry(0.23, 14, 10), skin);
  part(head, new THREE.SphereGeometry(0.245, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55).rotateZ(0.5), o.hair ?? 0x3b2a20, -0.012, 0.012, 0);
  for (const s of [-1, 1]) part(head, new THREE.SphereGeometry(0.028, 6, 5), 0x1b0f00, 0.215, 0.01, s * 0.085);
  if (o.hat !== undefined) {
    part(head, new THREE.CylinderGeometry(0.44, 0.46, 0.035, 18), o.hat, 0, 0.15, 0);
    part(head, new THREE.CylinderGeometry(0.17, 0.21, 0.17, 14), o.hat, 0, 0.24, 0);
  }
  return {
    root, hand: aR.hand,
    pose(p) {
      const w = p.walk ?? 0, st = p.stride ?? 0, sw = Math.sin(w) * st;
      legL.rotation.z = sw; legR.rotation.z = -sw;
      body.position.y = Math.abs(Math.cos(w)) * st * 0.06;
      aL.g.rotation.z = (p.armL ?? 0) - sw * 0.7; aR.g.rotation.z = (p.armR ?? 0) + sw * 0.7;
      aL.g.rotation.x = -(p.reachL ?? 0); aR.g.rotation.x = p.reachR ?? 0;
      head.rotation.y = p.headYaw ?? 0; head.rotation.z = p.headPitch ?? 0;
      torso.rotation.z = -(p.bow ?? 0);
    },
  };
}

export interface CatPose { sit?: number; walk?: number; tail?: number; headYaw?: number; headPitch?: number }
export interface Cat { root: THREE.Group; pose(p: CatPose): void }

/** A cat about 0.5 m long, feet at the origin, facing +x. `sit` goes from standing (0) to seated (1). */
export function cat(fur = 0xe8a04a, belly = 0xfff3dc, eye = 0x9fe870): Cat {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  shadow(root, 0.32, 0.2);
  const trunk = new THREE.Group();
  trunk.position.set(-0.17, 0.2, 0);
  body.add(trunk);
  part(trunk, new THREE.CapsuleGeometry(0.105, 0.3, 3, 10).rotateZ(Math.PI / 2).translate(0.17, 0.06, 0), fur);
  part(trunk, new THREE.SphereGeometry(0.085, 8, 6).scale(1.6, 0.8, 0.85).translate(0.2, -0.01, 0), belly);
  const legs = [[0.32, -1], [0.32, 1], [0.02, -1], [0.02, 1]].map(([x, s]) => {
    const g = new THREE.Group();
    g.position.set(x, 0.04, s * 0.07);
    part(g, new THREE.CapsuleGeometry(0.034, 0.15, 2, 6).translate(0, -0.11, 0), fur);
    trunk.add(g);
    return g;
  });
  const head = new THREE.Group();
  head.position.set(0.42, 0.17, 0);
  trunk.add(head);
  part(head, new THREE.SphereGeometry(0.115, 12, 9).scale(1, 0.9, 1.08), fur);
  part(head, new THREE.SphereGeometry(0.05, 8, 6).scale(1, 0.75, 1.3), belly, 0.085, -0.035, 0);
  for (const s of [-1, 1]) {
    part(head, new THREE.ConeGeometry(0.045, 0.1, 4).rotateY(Math.PI / 4), fur, -0.005, 0.115, s * 0.07);
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.021, 6, 5), new THREE.MeshBasicMaterial({ color: eye }));
    e.position.set(0.1, 0.02, s * 0.045);
    head.add(e);
  }
  const tail: THREE.Group[] = [];
  let at: THREE.Object3D = trunk;
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group();
    g.position.set(i ? -0.085 : -0.02, i ? 0 : 0.08, 0);
    part(g, new THREE.CapsuleGeometry(0.026, 0.07, 2, 6).rotateZ(Math.PI / 2).translate(-0.045, 0, 0), i > 3 ? belly : fur);
    at.add(g);
    at = g;
    tail.push(g);
  }
  return {
    root,
    pose(p) {
      const sit = p.sit ?? 0, w = p.walk ?? 0, tw = p.tail ?? 0;
      trunk.rotation.z = sit * 0.82;
      trunk.position.y = 0.2 - sit * 0.07;
      legs.forEach((l, i) => {
        const front = i < 2, sw = Math.sin(w + (i % 2 ? Math.PI : 0) + (front ? 0 : Math.PI)) * 0.5 * (1 - sit);
        l.rotation.z = sw + (front ? -sit * 0.82 : sit * 0.75);
      });
      head.rotation.z = -sit * 0.72 + (p.headPitch ?? 0);
      head.rotation.y = p.headYaw ?? 0;
      tail.forEach((g, i) => { g.rotation.z = (i ? -0.3 : -0.55 + sit * 0.4); g.rotation.y = Math.sin(tw - i * 0.7) * 0.34; });
    },
  };
}

export interface CowPose { graze?: number; tail?: number; walk?: number }
export interface Cow { root: THREE.Group; pose(p: CowPose): void }

/** A dairy cow about 2.2 m long, hooves at the origin, facing +x. `graze` lowers her head to the grass. */
export function cow(coat = 0xa8683c, patch = 0xfff6e6): Cow {
  const root = new THREE.Group();
  shadow(root, 1.25, 0.6);
  part(root, new THREE.CapsuleGeometry(0.46, 1.25, 4, 12).rotateZ(Math.PI / 2).translate(0, 1.12, 0), coat);
  part(root, new THREE.SphereGeometry(0.42, 10, 8).scale(1.1, 0.8, 1.02).translate(-0.35, 1.3, 0), patch);
  part(root, new THREE.SphereGeometry(0.3, 10, 8).scale(1.2, 0.7, 1.04).translate(0.5, 0.98, 0), patch);
  part(root, new THREE.SphereGeometry(0.17, 8, 6).translate(-0.45, 0.66, 0), 0xf2b8b0);
  const legs = [[0.72, -1], [0.72, 1], [-0.72, -1], [-0.72, 1]].map(([x, s]) => {
    const g = new THREE.Group();
    g.position.set(x, 0.86, s * 0.26);
    part(g, new THREE.CapsuleGeometry(0.095, 0.6, 2, 8).translate(0, -0.42, 0), coat);
    part(g, new THREE.CylinderGeometry(0.11, 0.12, 0.14, 8).translate(0, -0.8, 0), 0x2b2420);
    root.add(g);
    return g;
  });
  const neck = new THREE.Group();
  neck.position.set(0.98, 1.38, 0);
  root.add(neck);
  part(neck, new THREE.CapsuleGeometry(0.24, 0.42, 3, 10).rotateZ(-0.9).translate(0.2, 0.14, 0), coat);
  const head = new THREE.Group();
  head.position.set(0.5, 0.36, 0);
  neck.add(head);
  part(head, new THREE.CapsuleGeometry(0.2, 0.3, 3, 10).rotateZ(Math.PI / 2 - 0.5).translate(0.14, -0.06, 0), patch);
  part(head, new THREE.SphereGeometry(0.17, 8, 6).scale(1, 0.8, 1.1).translate(0.36, -0.2, 0), 0xf2b8b0);
  for (const s of [-1, 1]) {
    part(head, new THREE.ConeGeometry(0.05, 0.22, 6).rotateX(s * 0.7), 0xf4ecd8, -0.02, 0.2, s * 0.17);
    part(head, new THREE.SphereGeometry(0.09, 6, 5).scale(0.5, 1, 1.5), coat, -0.06, 0.06, s * 0.27);
    part(head, new THREE.SphereGeometry(0.035, 6, 5), 0x1b0f00, 0.24, 0.02, s * 0.17);
  }
  part(neck, new THREE.CylinderGeometry(0.13, 0.15, 0.16, 8), 0xf2c14a, 0.36, -0.2, 0);
  const tail = new THREE.Group();
  tail.position.set(-1.08, 1.4, 0);
  root.add(tail);
  part(tail, new THREE.CapsuleGeometry(0.035, 0.7, 2, 6).translate(0, -0.4, 0), coat);
  part(tail, new THREE.SphereGeometry(0.08, 6, 5).scale(1, 1.6, 1), 0x2b2420, 0, -0.82, 0);
  return {
    root,
    pose(p) {
      const gz = p.graze ?? 0, w = p.walk ?? 0;
      neck.rotation.z = -gz * 1.25;
      head.rotation.z = gz * 0.3 + Math.sin((p.tail ?? 0) * 0.6) * 0.04;
      tail.rotation.x = Math.sin(p.tail ?? 0) * 0.5;
      tail.rotation.z = -0.15;
      legs.forEach((l, i) => { l.rotation.z = Math.sin(w + (i % 3 ? Math.PI : 0)) * 0.35 * (p.walk === undefined ? 0 : 1); });
    },
  };
}
