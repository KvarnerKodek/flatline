import * as THREE from 'three';
import { glow } from './toon';
import { softParticle, softSprite } from './softdepth';
import { ss } from './timeline';
const TAU = Math.PI * 2;
const rng = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

export interface FxEvent { t: number; p: THREE.Vector3; color: number; size: number; life: number; rise?: number; spread?: number; grow?: number; opacity?: number }

/** Opacity `u` (0 to 1) through a burst's life: eases in, then fades with a soft tail. */
export const fxOpacity = (u: number) => ss(0, 0.16, u) * (1 - u) ** 1.5;

/** Sprite bursts scheduled up front and drawn as a pure function of time. */
export class Fx {
  group = new THREE.Group();
  private items: { e: FxEvent; s: THREE.Sprite; dir: THREE.Vector3 }[] = [];
  private r = rng(11);
  add(e: FxEvent, n = 1) {
    for (let i = 0; i < n; i++) {
      const s = glow(e.color, e.size, 1); s.visible = false; s.renderOrder = 5; softSprite(s.material as THREE.SpriteMaterial); softParticle(s);
      this.group.add(s);
      const a = this.r() * TAU, d = (e.spread ?? 0) * (0.4 + this.r() * 0.6);
      this.items.push({ e: { ...e, t: e.t + i * 0.012 }, s, dir: new THREE.Vector3(Math.cos(a) * d, (this.r() - 0.2) * (e.spread ?? 0) * 0.6, Math.sin(a) * d) });
    }
  }
  update(t: number) {
    for (const { e, s, dir } of this.items) {
      const u = (t - e.t) / e.life;
      if (u < 0 || u > 1) { s.visible = false; continue; }
      s.visible = true;
      const k = 1 - Math.pow(1 - u, 2);
      s.position.set(e.p.x + dir.x * k, e.p.y + dir.y * k + (e.rise ?? 0) * u, e.p.z + dir.z * k);
      s.scale.setScalar(e.size * (1 + (e.grow ?? 0.8) * u));
      (s.material as THREE.SpriteMaterial).opacity = (e.opacity ?? 1) * fxOpacity(u);
    }
  }
}

