import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toon, outline } from './toon';

const rng = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function puff(r: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const n = 6 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const rad = 60 + r() * 70;
    const g = new THREE.IcosahedronGeometry(rad, 2);
    g.scale(1, 0.62 + r() * 0.15, 1);
    const spread = i - (n - 1) / 2;
    g.translate(spread * 78 + (r() - 0.5) * 30, (i % 2 ? 22 : 0) + r() * 26, (r() - 0.5) * 70);
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    parts.push(g);
  }
  const merged = mergeVertices(mergeGeometries(parts)!, 0.5);
  merged.computeVertexNormals();
  return merged;
}

export interface Clouds { group: THREE.Group; update(t: number, vis: number): void }

/** Painted cumulus: a few puffy clusters drifting slowly around the viewer. Deterministic in t. */
export function makeClouds(count = 11, seed = 7): Clouds {
  const group = new THREE.Group();
  const r = rng(seed);
  const mat = toon({ color: 0xffffff, spec: 0, emissive: 0xfff6e6, emisAmt: 0.3 });
  const ink = outline(3);
  const items: { m: THREE.Group; a0: number; rad: number; h: number; speed: number; s: number }[] = [];
  for (let i = 0; i < count; i++) {
    const g = puff(r);
    const m = new THREE.Group();
    m.add(new THREE.Mesh(g, mat), new THREE.Mesh(g, ink));
    m.children[0].userData.noShadow = true;
    group.add(m);
    items.push({ m, a0: r() * Math.PI * 2, rad: 3200 + r() * 3200, h: 520 + r() * 520, speed: 0.0009 + r() * 0.0007, s: 1.1 + r() * 1.5 });
  }
  return {
    group,
    update(t, vis) {
      group.visible = vis > 0.02;
      for (const c of items) {
        const a = c.a0 + t * c.speed;
        c.m.position.set(Math.cos(a) * c.rad, c.h, Math.sin(a) * c.rad);
        c.m.rotation.y = -a + Math.PI / 2;
        c.m.scale.setScalar(c.s * (0.4 + 0.6 * vis));
      }
    },
  };
}
