import * as THREE from 'three';
import { Motes } from './motes';
import { hex } from './toon';
import { ss } from './timeline';

const GOLDEN = 2.399963;

export interface Burst { t: number; p: THREE.Vector3; r: number }

export interface FireworkOpts {
  /** Colours handed to bursts in turn; the first sparks of each ray flare in `hot`. */
  colors?: number[];
  hot?: [number, number];
  /** Rays per burst and sparks trailing each ray. */
  rays?: number;
  trail?: number;
  /** Seconds the burst lives and the seconds its shell takes to rise before `t`. */
  life?: number;
  rise?: number;
  /** Metres the shell climbs and the sparks sag. */
  climb?: number;
  sag?: number;
  /** Spark diameter in metres at full brightness. */
  size?: number;
}

type Resolved = Required<FireworkOpts>;
export interface Spark { x: number; y: number; z: number; size: number; hot: boolean }

/** Sparks per burst: the rays and their trails, then a short tail behind the rising shell. */
export const sparksPerBurst = (o: Pick<Resolved, 'rays' | 'trail'>) => o.rays * o.trail + 6;

/** Spark `k` of a burst of radius `r`, `dt` seconds after it goes off, relative to its centre; null while it is not alight. */
export function sparkAt(k: number, dt: number, r: number, o: Resolved): Spark | null {
  if (dt < -o.rise || dt > o.life) return null;
  if (k >= o.rays * o.trail) {
    const j = k - o.rays * o.trail, u = (dt + o.rise) / o.rise - j * 0.07;
    return u < 0 || u > 1 ? null : { x: 0, y: -o.climb * (1 - u * u), z: 0, size: 0.7 * (1 - j * 0.12) * o.size, hot: true };
  }
  const ray = Math.floor(k / o.trail), j = k % o.trail, u = dt / o.life - j * 0.035;
  if (u < 0) return null;
  const y = 1 - (2 * (ray + 0.5)) / o.rays, rad = Math.sqrt(1 - y * y), ph = ray * GOLDEN, e = 1 - (1 - u) ** 3;
  const size = (1 - ss(0.45, 1, u)) * (1 - j * 0.22) * (0.6 + 0.4 * Math.sin(u * 40 + ray)) * o.size;
  return { x: Math.cos(ph) * rad * r * e, y: y * r * e - o.sag * u * u, z: Math.sin(ph) * rad * r * e, size, hot: j === 0 && u < 0.25 };
}

/** Opaque round sparks with trails, so bursts read against a bright daylight sky. Scheduled up front, a pure function of time. */
export class Fireworks {
  group = new THREE.Group();
  private motes: Motes;
  private o: Resolved;
  private colors: THREE.Vector3[];
  private hot: THREE.Vector3[];

  constructor(private bursts: Burst[], o: FireworkOpts = {}) {
    this.o = { colors: [0xe15a41, 0x8b40ed, 0xffffff, 0x61d2da, 0xfff1d6], hot: [0xffffff, 0xfff1d6], rays: 40, trail: 4, life: 2.2, rise: 0.7, climb: 60, sag: 14, size: 3.2, ...o };
    this.colors = this.o.colors.map(hex);
    this.hot = this.o.hot.map(hex);
    this.motes = new Motes(bursts.length * sparksPerBurst(this.o), 1);
    this.group.add(this.motes.points);
  }

  update(t: number) {
    const m = this.motes, n = sparksPerBurst(this.o);
    m.begin();
    this.bursts.forEach((b, i) => {
      for (let k = 0; k < n; k++) {
        const s = sparkAt(k, t - b.t, b.r, this.o);
        if (s) m.add(b.p.x + s.x, b.p.y + s.y, b.p.z + s.z, s.size, s.hot ? this.hot[i % this.hot.length] : this.colors[i % this.colors.length]);
      }
    });
    m.end();
  }
}
