import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { G, COMMON } from './toon';

export interface SoftCloudOpts {
  count?: number; seed?: number;
  /** distance from the viewer, metres */
  distance?: [number, number];
  /** base altitude, metres */
  height?: [number, number];
  /** cluster size, metres */
  size?: [number, number];
  /** sunlit top, mid-tone and shaded underside colours (RGB 0 to 1) */
  light?: [number, number, number]; mid?: [number, number, number]; shade?: [number, number, number];
}
export interface SoftClouds { group: THREE.Group; update(t: number, vis?: number): void }

const rng = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

/** One cumulus: overlapping lobes with a flat base and a domed, billowing top. */
function cumulus(r: () => number, s: number): THREE.BufferGeometry {
  const n = 11 + Math.floor(r() * 6), lobes: { c: THREE.Vector3; rad: number }[] = [], parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < n; k++) {
    const u = (k + 0.5) / n, hump = Math.sin(u * Math.PI), rad = s * (0.3 + 0.42 * hump * (0.65 + r() * 0.55));
    const g = new THREE.IcosahedronGeometry(rad, 3);
    g.deleteAttribute('uv'); g.deleteAttribute('normal');
    g.translate((u - 0.5) * s * 2.3 + (r() - 0.5) * s * 0.35, rad * 0.5 + hump * s * 0.28 * (0.5 + r() * 0.7), (r() - 0.5) * s * 0.55);
    g.computeBoundingSphere();
    lobes.push({ c: g.boundingSphere!.center.clone(), rad });
    parts.push(g);
  }
  const v = new THREE.Vector3();
  parts.forEach((g, k) => {
    const p = g.getAttribute('position'), crease = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      crease[i] = lobes.reduce((m, l, j) => (j === k ? m : Math.max(m, 1 - Math.min(1, Math.max(0, v.distanceTo(l.c) / l.rad - 1) / 0.12))), 0);
    }
    g.setAttribute('aC', new THREE.BufferAttribute(crease, 1));
  });
  const g = mergeGeometries(parts.map((q) => mergeVertices(q, 0.01)))!;
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) p.setY(i, p.getY(i) * 0.12);
  g.computeVertexNormals();
  g.computeBoundingBox();
  const { min, max } = g.boundingBox!, h = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) h[i] = (p.getY(i) - min.y) / (max.y - min.y);
  g.setAttribute('aH', new THREE.BufferAttribute(h, 1));
  return g;
}

/**
 * Painted cumulus: lit 3D lobes with a bright top, a lavender-blue underside, crisp billowy edges and a warm rim,
 * drifting slowly around the viewer. Add `group.userData.followY = 0` to `film.follow` so the layer stays centred on the camera.
 */
export function makeSoftClouds(o: SoftCloudOpts = {}): SoftClouds {
  const { count = 18, seed = 11, distance = [2200, 6500], height = [380, 900], size = [320, 720] } = o;
  const light = new THREE.Vector3(...(o.light ?? [1, 1, 1])), mid = new THREE.Vector3(...(o.mid ?? [0.97, 0.975, 1])), shade = new THREE.Vector3(...(o.shade ?? [0.76, 0.79, 0.96]));
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...G, uCl: { value: light }, uCm: { value: mid }, uCs: { value: shade } },
    vertexShader: 'attribute float aH, aC; varying float vH, vC; varying vec3 vN; varying vec3 vW; void main(){ vH = aH; vC = aC; vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; vN = mat3(modelMatrix)*normal; gl_Position = projectionMatrix*viewMatrix*w; }',
    fragmentShader: /* glsl */ `
      ${COMMON}
      uniform vec3 uCl, uCm, uCs; varying float vH, vC; varying vec3 vN; varying vec3 vW;
      void main(){
        vec3 n = unit(vN), v = normalize(cameraPosition - vW);
        float nl = dot(n, uLightDir);
        float wash = fbm(vW.xz*.004 + vW.y*.01) - .5;
        vec3 col = mix(uCs, uCm, smoothstep(-.45,.05,nl + wash*.25));
        col = mix(col, uCl, smoothstep(-.2,.15,nl + wash*.2));
        col = mix(col, uCs*.94, (1.-smoothstep(-.7,.15,n.y))*.55);
        col = mix(col, uCs, (1.-smoothstep(.0,.55,vH))*.4);
        col = mix(col, uCs*.92, smoothstep(.1,.9,vC)*.55);
        col = mix(col, uCl, smoothstep(.7,1.,vH)*.25*smoothstep(-.3,.3,nl));
        float rim = pow(1.-clamp(dot(n,v),0.,1.),2.6)*smoothstep(-.2,.6,nl);
        col += uLightCol*.22*rim;
        col *= 1. - .22*uNight;
        float d = length(cameraPosition - vW), f = 1.-exp(-pow(d*uFogD*.2,1.35));
        gl_FragColor = vec4(mix(col, uFog, clamp(f*.3 + smoothstep(2500.,7500.,d)*.4,0.,1.)), 1.);
      }`,
  });
  const group = new THREE.Group(), r = rng(seed), clusters: { m: THREE.Mesh; a0: number; rad: number; speed: number; h: number }[] = [];
  for (let i = 0; i < count; i++) {
    const s = size[0] + r() * (size[1] - size[0]), m = new THREE.Mesh(cumulus(r, s), mat);
    m.frustumCulled = false; m.rotation.y = r() * Math.PI * 2; m.scale.set(1.3, 0.85, 1);
    group.add(m);
    clusters.push({ m, a0: r() * Math.PI * 2, rad: distance[0] + r() * (distance[1] - distance[0]), speed: 0.0004 + r() * 0.0005, h: height[0] + r() * (height[1] - height[0]) });
  }
  return {
    group,
    update(t, vis = 1) {
      group.visible = vis > 0.02;
      for (const c of clusters) { const a = c.a0 + t * c.speed; c.m.position.set(Math.cos(a) * c.rad, c.h, Math.sin(a) * c.rad); }
    },
  };
}
