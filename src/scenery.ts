import * as THREE from 'three';
import { Inst } from './instanced';
import { HeightFn } from './land';
import { Mesher, finish } from './props';
import { hex, toon } from './toon';

const TAU = Math.PI * 2;
const rng = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

export interface Spot { x: number; y: number; z: number; s: number }

export interface ScatterOpts {
  ground: HeightFn;
  /** Region as `[min, max]` along x and z. */
  x: [number, number];
  z: [number, number];
  count: number;
  /** Size range of each spot's `s`. */
  size?: [number, number];
  /** Returns whether a point at height `y` may hold something; given `(x, z, y)`. Rejected points are redrawn. */
  accept?: (x: number, z: number, y: number) => boolean;
  /** Draw attempts per wanted spot before giving up. */
  tries?: number;
  seed?: number;
}

/** Up to `count` random spots on the ground inside a region, skipping where `accept` says no. Same options, same spots. */
export function scatter(o: ScatterOpts): Spot[] {
  const r = rng(o.seed ?? 5), { size = [1, 1], tries = 12, accept = () => true } = o, out: Spot[] = [];
  for (let i = 0; i < o.count * tries && out.length < o.count; i++) {
    const x = o.x[0] + r() * (o.x[1] - o.x[0]), z = o.z[0] + r() * (o.z[1] - o.z[0]), y = o.ground(x, z), s = size[0] + r() * (size[1] - size[0]);
    if (accept(x, z, y)) out.push({ x, y, z, s });
  }
  return out;
}

export interface TreeFieldOpts {
  greens?: number[];
  trunk?: number;
  /** Wind sway in metres at the crown tops. */
  sway?: number;
  seed?: number;
}

const CROWNS = 5;

/** Thousands of trees in two draw calls: a trunk and a ring of rounded crowns each, with wind sway and per-crown colour. Spot `s` scales the tree. */
export function treeField(spots: Spot[], o: TreeFieldOpts = {}): THREE.Group {
  const { greens = [0x7bc65a, 0x5faf52, 0x95d46a, 0x4d9b4c], trunk = 0x7a5236, sway = 0.5, seed = 4 } = o, r = rng(seed);
  const crownGeo = new THREE.IcosahedronGeometry(1, 1);
  crownGeo.deleteAttribute('uv');
  const crowns = new Inst(crownGeo, spots.length * CROWNS, { colors: true, ink: 0, spec: 0.02, sway: [sway, 2, 1] });
  const trunks = new Inst(new THREE.CylinderGeometry(0.18, 0.3, 1, 7).translate(0, 0.5, 0), spots.length, { color: trunk, ink: 2 });
  spots.forEach((s, i) => {
    const yaw = r() * TAU, th = 2.2 * s.s + r();
    trunks.set(i, s.x, s.y - 0.2, s.z, yaw, s.s, th, s.s);
    for (let j = 0; j < CROWNS; j++) {
      const a = (j / (CROWNS - 1)) * TAU + yaw, rad = j ? 1.15 * s.s : 0, cs = (j ? 1.05 + (j % 2) * 0.2 : 1.7) * s.s, k = i * CROWNS + j;
      crowns.set(k, s.x + Math.cos(a) * rad, s.y + th + (j ? 0.15 + (j % 2) * 0.6 : 1) * s.s, s.z + Math.sin(a) * rad, yaw, cs, cs * 0.8, cs);
      crowns.color(k, greens[Math.floor(r() * greens.length)]);
    }
  });
  crowns.commit(); trunks.commit();
  const g = new THREE.Group();
  g.add(crowns.group, trunks.group);
  return g;
}

export interface TuftOpts { colors?: number[]; size?: number; sway?: number; fade?: [near: number, far: number]; seed?: number }

/** Grass tufts or flower heads as one instanced mesh that sways and shrinks away with distance, so far ground never shimmers. */
export function tufts(spots: Spot[], geo: THREE.BufferGeometry, o: TuftOpts = {}): THREE.Group {
  const { colors = [0x9bdc66, 0x7cc65a, 0xb2e272, 0x62ad4f], size = 1, sway = 0.45, fade = [55, 150], seed = 8 } = o, r = rng(seed);
  const field = new Inst(geo, spots.length, { colors: true, ink: 0, spec: 0, sway: [sway, 1.5, 0], fade });
  spots.forEach((s, i) => {
    field.set(i, s.x, s.y - 0.1, s.z, r() * TAU, size * s.s * (0.9 + r() * 0.8), size * s.s * (0.8 + r() * 1.2), size * s.s * (0.9 + r() * 0.8), (r() - 0.5) * 0.4, (r() - 0.5) * 0.4);
    field.color(i, colors[Math.floor(r() * colors.length)]);
  });
  field.commit();
  return field.group;
}

export interface WindmillOpts {
  stone?: number; wall?: number; band?: number; cap?: number; trim?: number; door?: number;
  /** Colours of the sail panels, cycled along each arm. */
  sails?: number[];
  /** Height of the tower in metres. */
  height?: number;
}

export interface Windmill { root: THREE.Group; blades: THREE.Group; /** Turns the sails to the angle for time `t` at `rpm`. */ spin(t: number, rpm?: number): void }

/** Sail angle at time `t` for `rpm` revolutions a minute; pure, so the sails are in the same place on every seek. */
export const sailAngle = (t: number, rpm = 5) => (t * rpm * TAU) / 60;

/** A tower mill with a domed cap, a door and four sails facing +z, standing on the origin. */
export function windmill(o: WindmillOpts = {}): Windmill {
  const { stone = 0xe2dccd, wall = 0xf6ecd8, band = 0xdccdb2, cap = 0x8a5a3a, trim = 0xf4efe4, door = 0x8a5a3a, sails = [0x61d2da, 0xf4efe4, 0xe15a41, 0xf4efe4, 0x8b40ed], height = 24 } = o, k = height / 24;
  const m = new Mesher(), c = (h: number) => hex(h);
  m.cyl(0, -2, 0, 3, 7.4, c(stone), 12, 7.2);
  m.cyl(0, 3, 0, 24, 6.6, c(wall), 12, 4.3);
  for (const y of [9, 16]) m.cyl(0, y, 0, y + 0.9, y === 9 ? 6.5 : 5.8, c(band), 12, y === 9 ? 6.5 : 5.8);
  m.cyl(0, 24, 0, 25.4, 5.2, c(cap), 12, 5.2);
  m.cyl(0, 25.4, 0, 33, 5.4, c(cap), 12, 0.5);
  m.cyl(0, 33, 0, 36, 0.5, c(cap), 6, 0.2);
  m.box(0, 5, 6.1, 3.4, 6, 0.8, c(door));
  m.box(0, 8.2, 6.2, 3.4, 0.4, 0.9, c(trim));
  const root = new THREE.Group();
  root.add(finish(m));
  const arm = new Mesher();
  arm.c = null;
  arm.box(0, 12.5, 0, 0.7, 25, 0.7, c(cap));
  for (let i = 0; i < 5; i++) { arm.box(2, 5 + i * 4.2, 0.1, 4, 3.6, 0.25, c(sails[i % sails.length])); arm.box(2, 3 + i * 4.2, 0.3, 4.2, 0.35, 0.4, c(cap)); }
  arm.box(4.1, 12.5, 0.25, 0.35, 19.5, 0.4, c(cap));
  const sail = finish(arm), blades = new THREE.Group();
  blades.position.set(0, 24, 7.2);
  for (let i = 0; i < 4; i++) { const b = sail.clone(); b.rotation.z = (i * Math.PI) / 2; blades.add(b); }
  blades.add(new THREE.Mesh(new THREE.SphereGeometry(1.6, 10, 8), toon({ color: cap, spec: 0 })));
  root.add(blades);
  root.scale.setScalar(k);
  return { root, blades, spin: (t, rpm) => { blades.rotation.z = sailAngle(t, rpm); } };
}
