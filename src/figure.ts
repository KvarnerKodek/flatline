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
/** `mood` runs from -1, a worried frown with raised inner brows, to 1, a smile. */
export interface FigurePose { walk?: number; stride?: number; armL?: number; armR?: number; reachL?: number; reachR?: number; headYaw?: number; headPitch?: number; bow?: number; mood?: number }

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
  const brows: THREE.Mesh[] = [];
  const face = (g: THREE.BufferGeometry, color: number, x: number, y: number, z: number) => { const m = new THREE.Mesh(g, mat(color)); m.position.set(x, y, z); head.add(m); return m; };
  for (const s of [-1, 1]) {
    part(head, new THREE.SphereGeometry(0.03, 8, 6).scale(0.6, 1.15, 1), 0x1b0f00, 0.212, 0.012, s * 0.082);
    face(new THREE.SphereGeometry(0.009, 6, 4), 0xffffff, 0.229, 0.024, s * 0.078);
    brows.push(face(new THREE.BoxGeometry(0.012, 0.012, 0.055), o.hair ?? 0x3b2a20, 0.214, 0.066, s * 0.084));
    face(new THREE.SphereGeometry(0.036, 8, 6).scale(0.35, 0.7, 1), 0xf2958a, 0.2, -0.045, s * 0.125);
  }
  part(head, new THREE.SphereGeometry(0.03, 8, 6).scale(1.2, 0.9, 0.9), skin, 0.232, -0.028, 0);
  const mouth = face(new THREE.TorusGeometry(0.035, 0.008, 4, 10, Math.PI * 0.8).rotateY(Math.PI / 2).rotateX(Math.PI + Math.PI * 0.1).translate(0, 0.02, 0), 0x7a2e22, 0.216, -0.095, 0);
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
      const mood = p.mood ?? 0.6;
      mouth.scale.set(1, Math.sign(mood || 1) * (0.5 + 0.5 * Math.abs(mood)), 1);
      brows.forEach((b, i) => { b.rotation.x = (i ? 1 : -1) * 0.45 * Math.max(0, -mood); b.position.y = 0.066 + 0.01 * Math.abs(mood); });
    },
  };
}

/** `blink` closes the eyes (a slow blink is a cat's hello), `paw` lifts the right forepaw in a wave, `tilt` rolls the head. */
const isIn = (o: THREE.Object3D, root: THREE.Object3D): boolean => (o === root ? true : o.parent ? isIn(o.parent, root) : false);

export interface CatPose { sit?: number; walk?: number; tail?: number; headYaw?: number; headPitch?: number; blink?: number; paw?: number; tilt?: number }
export interface Cat { root: THREE.Group; pose(p: CatPose): void }

/**
 * A friendly storybook cat about 0.5 m long that settles onto the ground in any pose (paws and rump rest at y = 0), facing +x: a large head with round amber eyes,
 * a pink nose and a small smile. `collar` adds a collar with a gold tag. `sit` goes from standing (0) to seated (1).
 */
export function cat(fur = 0xe8a04a, belly = 0xfff3dc, eye = 0xd99a2b, collar?: number): Cat {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  shadow(root, 0.32, 0.2);
  const trunk = new THREE.Group(), at = new THREE.Vector3();
  trunk.position.set(-0.17, 0.2, 0);
  body.add(trunk);
  part(trunk, new THREE.CapsuleGeometry(0.105, 0.3, 3, 10).rotateZ(Math.PI / 2).translate(0.17, 0.06, 0), fur);
  part(trunk, new THREE.SphereGeometry(0.085, 8, 6).scale(1.6, 0.8, 0.85).translate(0.2, -0.01, 0), belly);
  const legs = [[0.32, -1], [0.32, 1], [0.02, -1], [0.02, 1]].map(([x, s]) => {
    const g = new THREE.Group();
    g.position.set(x, 0.04, s * 0.07);
    part(g, new THREE.CapsuleGeometry(0.034, 0.15, 2, 6).translate(0, -0.11, 0), fur);
    part(g, new THREE.SphereGeometry(0.04, 8, 6).scale(1.2, 0.8, 1), belly, 0.01, -0.19, 0);
    trunk.add(g);
    return g;
  });
  const head = new THREE.Group();
  head.position.set(0.43, 0.19, 0);
  trunk.add(head);
  part(head, new THREE.SphereGeometry(0.135, 14, 11).scale(0.95, 0.88, 1.12), fur);
  part(head, new THREE.SphereGeometry(0.06, 10, 8).scale(0.9, 0.7, 1.35), belly, 0.085, -0.045, 0);
  const lids: THREE.Mesh[] = [];
  const bit = (g: THREE.BufferGeometry, color: number, x: number, y: number, z: number) => { const m = new THREE.Mesh(g, mat(color)); m.position.set(x, y, z); head.add(m); return m; };
  for (const s of [-1, 1]) {
    part(head, new THREE.ConeGeometry(0.055, 0.12, 4).rotateY(Math.PI / 4).rotateX(s * -0.25), fur, -0.01, 0.125, s * 0.075);
    bit(new THREE.ConeGeometry(0.032, 0.075, 4).rotateY(Math.PI / 4).rotateX(s * -0.25), 0xf2a6a0, 0.012, 0.118, s * 0.073);
    const e = new THREE.Group();
    e.position.set(0.108, 0.022, s * 0.05);
    head.add(e);
    e.add(new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10).scale(0.5, 1.1, 1), mat(eye)));
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8).scale(0.5, 1.15, 1), mat(0x1b0f00));
    pupil.position.x = 0.006;
    e.add(pupil);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.0075, 6, 5), mat(0xffffff));
    glint.position.set(0.014, 0.012, s * -0.006);
    e.add(glint);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.033, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.55, 1.1, 1.06), mat(fur));
    lid.position.x = 0.002;
    e.add(lid);
    lids.push(lid);
    bit(new THREE.SphereGeometry(0.022, 8, 6).scale(0.3, 0.6, 1), 0xf29a8a, 0.11, -0.035, s * 0.078);
    for (const k of [-1, 1]) {
      const wsk = bit(new THREE.BoxGeometry(0.003, 0.003, 0.075), 0x6b4a35, 0.1, -0.03 + k * 0.012, s * 0.13);
      wsk.rotation.x = s * k * 0.18;
    }
  }
  bit(new THREE.SphereGeometry(0.014, 8, 6).scale(0.8, 0.7, 1.2), 0xe07a86, 0.138, -0.022, 0);
  for (const s of [-1, 1]) {
    const m = bit(new THREE.TorusGeometry(0.012, 0.0035, 4, 8, Math.PI).rotateY(Math.PI / 2).rotateX(Math.PI), 0x5a2e22, 0.131, -0.038, s * 0.011);
    m.scale.setScalar(1);
  }
  if (collar !== undefined) {
    part(trunk, new THREE.TorusGeometry(0.075, 0.016, 6, 16).rotateY(Math.PI / 2).rotateZ(0.9), collar, 0.34, 0.12, 0);
    part(trunk, new THREE.CylinderGeometry(0.024, 0.024, 0.008, 14).rotateZ(Math.PI / 2).rotateY(0.15), 0xf2c14a, 0.405, 0.055, 0);
  }
  const tail: THREE.Group[] = [];
  let link: THREE.Object3D = trunk;
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group();
    g.position.set(i ? -0.085 : -0.02, i ? 0 : 0.08, 0);
    part(g, new THREE.CapsuleGeometry(0.026, 0.07, 2, 6).rotateZ(Math.PI / 2).translate(-0.045, 0, 0), i > 3 ? belly : fur);
    link.add(g);
    link = g;
    tail.push(g);
  }
  return {
    root,
    pose(p) {
      const sit = p.sit ?? 0, w = p.walk ?? 0, tw = p.tail ?? 0, paw = p.paw ?? 0;
      trunk.rotation.z = sit * 0.82;
      trunk.position.y = 0.2 - sit * 0.07;
      legs.forEach((l, i) => {
        const front = i < 2, sw = Math.sin(w + (i % 2 ? Math.PI : 0) + (front ? 0 : Math.PI)) * 0.5 * (1 - sit);
        l.rotation.z = sw + (front ? -sit * 0.82 : sit * 0.75) + (i === 1 ? paw * (1.9 + 0.25 * Math.sin(tw * 3)) : 0);
        l.rotation.x = i === 1 ? -paw * 0.35 : 0;
      });
      head.rotation.z = -sit * 0.72 + (p.headPitch ?? 0);
      head.rotation.y = p.headYaw ?? 0;
      head.rotation.x = p.tilt ?? 0;
      const shut = Math.min(1, Math.max(0, p.blink ?? 0));
      for (const l of lids) { l.visible = shut > 0.02; l.rotation.z = (1 - shut) * 1.6; }
      tail.forEach((g, i) => {
        g.rotation.z = (1 - sit) * ((i ? 0.22 : -0.55) + (i > 3 ? 0.35 : 0)) + sit * (i ? -0.06 : -0.72);
        g.rotation.y = Math.sin(tw - i * 0.7) * 0.3 * (1 - 0.6 * sit) + sit * (i ? 0.42 : 0.2);
      });
      body.position.y = 0;
      body.updateMatrix();
      body.updateMatrixWorld(true);
      const inv = body.matrixWorld.clone().invert(), m = new THREE.Matrix4();
      let low = Infinity;
      body.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || (paw > 0.05 && isIn(o, legs[1]))) return;
        const pos = mesh.geometry.getAttribute('position');
        m.multiplyMatrices(inv, mesh.matrixWorld);
        for (let i = 0; i < pos.count; i += 2) low = Math.min(low, at.fromBufferAttribute(pos, i).applyMatrix4(m).y);
      });
      body.position.y = -low;
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
