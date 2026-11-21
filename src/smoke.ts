import * as THREE from 'three';
import { Inst } from './instanced';
import { ss } from './timeline';

const TAU = Math.PI * 2;

export interface SmokeOpts {
  /** Puffs per source. */
  per?: number;
  color?: number;
  /** Cycles per second: how often a puff completes its rise. */
  rate?: number;
  /** Puff radius when it leaves the source and when it fades out, in metres. */
  radius?: [from: number, to: number];
  /** Metres risen and metres leaned downwind over one life. */
  rise?: number;
  lean?: number;
  /** Sideways wobble in metres. */
  wobble?: number;
}

/** Breeze strength at time `t`, 0.6 to 1.4: smoke leans harder and softer in slow gusts. */
export const gust = (t: number) => 1 + 0.4 * Math.sin(t * 0.55) * Math.cos(t * 0.23 + 1);

/** Where puff `j` of source `i` is `u` (0 to 1) through its life, relative to the source, and how big it is. Pure in `t`. */
export function puffAt(t: number, i: number, j: number, o: Required<SmokeOpts>) {
  const u = (t * o.rate + j / o.per + i * 0.37) % 1, k = Math.sin(u * TAU * 2 + i + j) * 0.5 * o.wobble;
  const r = (o.radius[0] + u * (o.radius[1] - o.radius[0])) * ss(0, 0.12, u) * (1 - ss(0.75, 1, u));
  return { x: u * u * o.lean * gust(t) + k * u, y: u * o.rise, z: k * 0.6, r };
}

/** Soft cel puffs rising from chimneys, stacks or fires and leaning with a steady breeze. A pure function of time. */
export class Smoke {
  group = new THREE.Group();
  private puffs: Inst;
  private o: Required<SmokeOpts>;

  constructor(private sources: THREE.Vector3[], o: SmokeOpts = {}) {
    this.o = { per: 7, color: 0xf1ecff, rate: 0.16, radius: [0.5, 2.9], rise: 15, lean: 9, wobble: 1, ...o };
    this.puffs = new Inst(new THREE.IcosahedronGeometry(1, 1), sources.length * this.o.per, { color: this.o.color, ink: 0, spec: 0, emissive: 0xffffff, emisAmt: 0.3 });
    this.group.add(this.puffs.group);
  }

  update(t: number) {
    this.sources.forEach((s, i) => {
      for (let j = 0; j < this.o.per; j++) {
        const p = puffAt(t, i, j, this.o);
        this.puffs.set(i * this.o.per + j, s.x + p.x, s.y + p.y, s.z + p.z, 0, p.r, p.r * 0.85, p.r);
      }
    });
    this.puffs.commit();
  }
}
