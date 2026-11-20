import * as THREE from 'three';
import { G, hex } from './toon';
import { ss } from './timeline';

export interface Mood {
  zenith: THREE.Vector3;
  mid: THREE.Vector3;
  horizon: THREE.Vector3;
  light: THREE.Vector3;
  lightDir: THREE.Vector3;
  amb: THREE.Vector3;
  shadow: THREE.Vector3;
  rim: THREE.Vector3;
  fog: THREE.Vector3;
  fogD: number;
  deep: THREE.Vector3;
  shallow: THREE.Vector3;
  stars: number;
  moon: number;
  sun: number;
  night: number;
  cloud: THREE.Vector3;
  cloudShade: THREE.Vector3;
  land: THREE.Vector3;
  ridge: THREE.Vector3;
}

export const dir = (az: number, el: number) =>
  new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az)).normalize();

export const NIGHT: Mood = {
  zenith: hex(0x030818), mid: hex(0x0a1c3c), horizon: hex(0x2c5578),
  light: hex(0xb4c8ff), lightDir: dir(1.2, 0.42), amb: hex(0x3c5894), shadow: hex(0x5a72bc),
  rim: hex(0x7fb2ff), fog: hex(0x1f4063), fogD: 0.0022,
  deep: hex(0x020d1a), shallow: hex(0x0d3e58), stars: 1, moon: 1, sun: 0, night: 1,
  cloud: hex(0x24406a), cloudShade: hex(0x101f40), land: hex(0x0a1a2a), ridge: hex(0x0b2038),
};

export const DAWN: Mood = {
  zenith: hex(0x2b4f92), mid: hex(0x8a86b8), horizon: hex(0xffb68c),
  light: hex(0xffc78e), lightDir: dir(1.35, 0.14), amb: hex(0x8a8fc4), shadow: hex(0x6a5aa8),
  rim: hex(0xffd2a0), fog: hex(0xf2b69a), fogD: 0.00055,
  deep: hex(0x0a3858), shallow: hex(0x2f8fa6), stars: 0, moon: 0, sun: 1, night: 0.15,
  cloud: hex(0xffd0b8), cloudShade: hex(0xb07aa8), land: hex(0x7a6a7c), ridge: hex(0x8a6f9a),
};

export const DAY: Mood = {
  zenith: hex(0x2f7fd6), mid: hex(0x74bdec), horizon: hex(0xdaf2f7),
  light: hex(0xfff0d2), lightDir: dir(1.5, 0.7), amb: hex(0xa6c8ea), shadow: hex(0x5a7fc4),
  rim: hex(0xffffff), fog: hex(0xcbe8f2), fogD: 0.00035,
  deep: hex(0x0a5b86), shallow: hex(0x3bb8c4), stars: 0, moon: 0, sun: 1, night: 0,
  cloud: hex(0xffffff), cloudShade: hex(0xb4cdea), land: hex(0x6a9a5e), ridge: hex(0x5b8aa6),
};

export const DUSK: Mood = {
  zenith: hex(0x26306e), mid: hex(0xb86a8e), horizon: hex(0xffa25c),
  light: hex(0xffa866), lightDir: dir(-1.45, 0.11), amb: hex(0xb49ab8), shadow: hex(0x8a6f9c),
  rim: hex(0xffc890), fog: hex(0xe89a86), fogD: 0.0006,
  deep: hex(0x10305a), shallow: hex(0x4a7fa0), stars: 0.25, moon: 0, sun: 1, night: 0.35,
  cloud: hex(0xffb89a), cloudShade: hex(0x7a4f8c), land: hex(0x5a4a6a), ridge: hex(0x6a4f86),
};

export const STORM: Mood = {
  zenith: hex(0x05080f), mid: hex(0x111c2c), horizon: hex(0x2a3d52),
  light: hex(0x8fa6c8), lightDir: dir(0.6, 0.5), amb: hex(0x34465e), shadow: hex(0x3a4c70),
  rim: hex(0x6f8fb8), fog: hex(0x1a2836), fogD: 0.004,
  deep: hex(0x02080f), shallow: hex(0x12303f), stars: 0, moon: 0, sun: 0, night: 1,
  cloud: hex(0x2c3a4e), cloudShade: hex(0x0a1018), land: hex(0x0a141c), ridge: hex(0x0c1824),
};

export const GOLDEN: Mood = {
  zenith: hex(0x3f78c8), mid: hex(0xf0b88a), horizon: hex(0xffdc8a),
  light: hex(0xffd68a), lightDir: dir(1.42, 0.2), amb: hex(0xb0a0c0), shadow: hex(0x7a66b0),
  rim: hex(0xffe6a8), fog: hex(0xffd2a0), fogD: 0.00045,
  deep: hex(0x0f4a70), shallow: hex(0x4aa6b4), stars: 0, moon: 0, sun: 1, night: 0.08,
  cloud: hex(0xffe8c0), cloudShade: hex(0xc890a0), land: hex(0x8a7a6a), ridge: hex(0x9a7f9a),
};

export const AFTERNOON: Mood = {
  zenith: hex(0x3a86d8), mid: hex(0x9fd0ee), horizon: hex(0xffe9c4),
  light: hex(0xffe2b0), lightDir: dir(-1.2, 0.42), amb: hex(0xb4c4e0), shadow: hex(0x6f80c0),
  rim: hex(0xfff2d8), fog: hex(0xf2e2c8), fogD: 0.0004,
  deep: hex(0x0a5b86), shallow: hex(0x3bb8c4), stars: 0, moon: 0, sun: 1, night: 0,
  cloud: hex(0xfff6e6), cloudShade: hex(0xc8b8d8), land: hex(0x6a9a5e), ridge: hex(0x6f8fb0),
};

export const OVERCAST: Mood = {
  zenith: hex(0x6f7f92), mid: hex(0x9aa7b4), horizon: hex(0xc4cdd4),
  light: hex(0xc9d2dc), lightDir: dir(0.9, 0.8), amb: hex(0x9aa6b6), shadow: hex(0x66738c),
  rim: hex(0xdfe6ee), fog: hex(0xb4bfc8), fogD: 0.0011,
  deep: hex(0x23465a), shallow: hex(0x5a8a96), stars: 0, moon: 0, sun: 0, night: 0.12,
  cloud: hex(0xd0d7de), cloudShade: hex(0x7a8696), land: hex(0x5a7a5e), ridge: hex(0x6a7c8c),
};

export function mixMood(a: Mood, b: Mood, t: number): Mood {
  const m = {} as Mood;
  for (const k of Object.keys(a) as (keyof Mood)[]) {
    const x = a[k], y = b[k];
    (m as unknown as Record<string, unknown>)[k] =
      typeof x === 'number' ? x + ((y as number) - x) * t : (x as THREE.Vector3).clone().lerp(y as THREE.Vector3, t);
  }
  m.lightDir.normalize();
  return m;
}

/** A mood timeline: each key blends smoothly into the next over `blend` seconds centred on its time. */
export function moodTrack(keys: { t: number; mood: Mood; blend?: number }[], blend = 12) {
  return (t: number, fogBoost = 0): Mood => {
    let m = keys[0].mood;
    for (let i = 1; i < keys.length; i++) {
      const b = keys[i].blend ?? blend;
      m = mixMood(m, keys[i].mood, b > 0 ? ss(keys[i].t - b / 2, keys[i].t + b / 2, t) : t >= keys[i].t ? 1 : 0);
    }
    if (fogBoost) {
      m = mixMood(m, m, 0);
      m.fogD += fogBoost;
    }
    return m;
  };
}

export function applyMood(m: Mood) {
  G.uLightDir.value.copy(m.lightDir);
  G.uLightCol.value.copy(m.light);
  G.uAmb.value.copy(m.amb);
  G.uShadow.value.copy(m.shadow);
  G.uRim.value.copy(m.rim);
  G.uFog.value.copy(m.fog);
  G.uFogD.value = m.fogD;
  G.uNight.value = m.night;
}
