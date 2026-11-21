import * as THREE from 'three';
import { Inst } from './instanced';
import { HeightFn } from './land';
import { ss } from './timeline';

export interface ButterflyOpts {
  count?: number;
  /** Side of the drifting square around the focus, in metres. */
  span?: number;
  /** Mean height above the ground and the size of the bob. */
  height?: number;
  bob?: number;
  /** Wing colours, handed out in turn. */
  colors?: number[];
  /** Wing-beat size in metres. */
  size?: number;
  /** Drift in metres per second along x and z. */
  drift?: [number, number];
  /** Hidden closer to the camera than the first distance and fully shown beyond the second. */
  keepOut?: [near: number, far: number];
}

const wrap = (v: number, c: number, span: number) => (((v - c + span / 2) % span) + span) % span - span / 2 + c;

/** Position and size of butterfly `i` at time `t`: a wrapped lattice around `focus` that drifts and wobbles. Pure in `t`. */
export function flutter(i: number, t: number, focus: { x: number; z: number }, o: Required<Pick<ButterflyOpts, 'span' | 'drift'>>) {
  const h1 = (i * 0.618) % 1, h2 = (i * 0.414) % 1, span = o.span;
  const x = wrap(h1 * span + Math.sin(t * 0.7 + i) * 6 + t * o.drift[0], focus.x, span), z = wrap(h2 * span + Math.cos(t * 0.5 + i * 2) * 6 + t * o.drift[1], focus.z, span);
  const edge = Math.max(Math.abs(x - focus.x), Math.abs(z - focus.z)) / span;
  return { x, z, fade: 1 - ss(0.35, 0.5, edge) };
}

/** Butterflies drifting over a meadow around a focus point; a pure function of time. */
export class Butterflies {
  group = new THREE.Group();
  private flock: Inst;
  private o: Required<ButterflyOpts>;

  constructor(private ground: HeightFn, o: ButterflyOpts = {}) {
    this.o = { count: 56, span: 150, height: 2.2, bob: 1.2, colors: [0xffffff, 0xe15a41, 0x9fe8ee, 0xc7a6ff, 0xf4efe4], size: 1, drift: [1.4, 0.9], keepOut: [30, 55], ...o };
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.Float32BufferAttribute([-0.1, 0, 0, 0.1, 0, 0, 0.7, 1.1, 0.9, 0.2, 1.7, 1.5, -0.6, 1.2, 0.9, -0.1, 0, 0, 0.1, 0, 0, 0.7, 1.1, -0.9, 0.2, 1.7, -1.5, -0.6, 1.2, -0.9], 3));
    wing.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 5, 7, 6, 5, 8, 7, 5, 9, 8]);
    wing.computeVertexNormals();
    this.flock = new Inst(wing, this.o.count, { colors: true, ink: 0, spec: 0, side: THREE.DoubleSide, emissive: 0xffffff, emisAmt: 0.12 });
    for (let i = 0; i < this.o.count; i++) this.flock.color(i, this.o.colors[i % this.o.colors.length]);
    this.group.add(this.flock.group);
  }

  /** `focus` is the middle of the lattice, `vis` scales them all (0 hides the flock), `cam` keeps them off the lens. */
  update(t: number, focus: THREE.Vector3, vis = 1, cam?: THREE.Vector3) {
    const { count, height, bob, size, keepOut, span, drift } = this.o;
    for (let i = 0; i < count; i++) {
      const p = flutter(i, t, focus, { span, drift }), q = flutter(i, t + 0.05, focus, { span, drift }), near = cam ? ss(keepOut[0], keepOut[1], Math.hypot(p.x - cam.x, p.z - cam.z)) : 1;
      const k = vis * p.fade * near * 1.4 * size, y = this.ground(p.x, p.z) + height + bob * Math.sin(t * 1.9 + i * 1.7);
      this.flock.set(i, p.x, y, p.z, -Math.atan2(q.z - p.z, q.x - p.x), k, k * (0.5 + 0.9 * Math.abs(Math.sin(t * 13 + i * 3))), k);
    }
    this.flock.commit();
  }
}
