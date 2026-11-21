import * as THREE from 'three';
import { toon } from './toon';

const rng = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function wing(side: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const s = side;
  const v = [0, 0, 0, -0.5, 0, s * 0.5, -0.1, 0, s * 2.3, 0.5, 0, s * 0.4, -0.5, 0, s * 0.5, -0.1, 0, s * 2.3, 0.05, 0, s * 0.2];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v.slice(0, 18), 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(18).fill(1), 3));
  g.computeVertexNormals();
  return g;
}

export interface Birds { group: THREE.Group; update(t: number, center: THREE.Vector3, vis: number): void }

/** A loose flock of gulls circling a point; position and flapping are pure functions of t. */
export function makeBirds(count = 9, seed = 3): Birds {
  const group = new THREE.Group();
  const r = rng(seed);
  const mat = toon({ vertexColors: true, color: 0xffffff, spec: 0, side: THREE.DoubleSide, emissive: 0xffffff, emisAmt: 0.25 });
  const body = new THREE.CapsuleGeometry(0.22, 0.9, 2, 6);
  body.rotateZ(Math.PI / 2);
  const bc = new Float32Array(body.getAttribute('position').count * 3).fill(1);
  body.setAttribute('color', new THREE.BufferAttribute(bc, 3));
  const birds = Array.from({ length: count }, () => {
    const g = new THREE.Group();
    const wl = new THREE.Mesh(wing(-1), mat), wr = new THREE.Mesh(wing(1), mat);
    g.add(new THREE.Mesh(body, mat), wl, wr);
    group.add(g);
    return { g, wl, wr, a0: r() * Math.PI * 2, rad: 14 + r() * 60, h: 8 + r() * 16, w: (0.05 + r() * 0.05) * (r() < 0.5 ? 1 : -1), ph: r() * 6.28, f: 5 + r() * 2 };
  });
  return {
    group,
    update(t, c, vis) {
      group.visible = vis > 0.02;
      for (const b of birds) {
        const a = b.a0 + t * b.w;
        b.g.position.set(c.x + Math.cos(a) * b.rad, c.y + b.h + Math.sin(t * 0.7 + b.ph) * 2, c.z + Math.sin(a) * b.rad);
        const dir = Math.sign(b.w), beat = t * b.f + b.ph, glide = 0.35 + 0.65 * Math.sin(t * 0.3 + b.ph * 3) ** 2, fl = (Math.sin(beat) + 0.3 * Math.sin(2 * beat - 0.6)) * 0.5 * glide;
        b.g.rotation.order = 'YXZ';
        b.g.rotation.set(dir * 0.28, -a - dir * Math.PI / 2, -0.04 * Math.cos(beat) * glide);
        b.g.position.y -= 0.35 * fl;
        b.wl.rotation.x = fl; b.wr.rotation.x = -fl;
        b.g.scale.setScalar(1.6 * vis);
      }
    },
  };
}
