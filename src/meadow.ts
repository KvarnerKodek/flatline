import * as THREE from 'three';
import { G, COMMON } from './toon';

/** Painted meadow ground: banded greens, flower specks, fogged to the horizon. Set `userData.followY = 0` so it stays on the ground. */
export interface MeadowPalette { a: [number, number, number]; b: [number, number, number]; c: [number, number, number]; d: [number, number, number]; flowers?: boolean }
export const SPRING: MeadowPalette = { a: [0.50, 0.78, 0.34], b: [0.36, 0.66, 0.33], c: [0.68, 0.87, 0.42], d: [0.30, 0.57, 0.31], flowers: true };

export function makeMeadow(palette: MeadowPalette = SPRING): THREE.Mesh {
  const rings = 90, seg = 128, r0 = 4, r1 = 14000;
  const pos: number[] = [0, 0, 0], idx: number[] = [];
  const grow = Math.pow(r1 / r0, 1 / (rings - 1));
  for (let i = 0; i < rings; i++) { const r = r0 * Math.pow(grow, i); for (let j = 0; j < seg; j++) { const a = (j / seg) * Math.PI * 2; pos.push(Math.cos(a) * r, 0, Math.sin(a) * r); } }
  for (let j = 0; j < seg; j++) idx.push(0, 1 + ((j + 1) % seg), 1 + j);
  for (let i = 0; i < rings - 1; i++) for (let j = 0; j < seg; j++) { const a = 1 + i * seg + j, b = 1 + i * seg + ((j + 1) % seg), c = a + seg, d = b + seg; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
    uniforms: { ...G, uG1: { value: new THREE.Vector3(...palette.a) }, uG2: { value: new THREE.Vector3(...palette.b) }, uG3: { value: new THREE.Vector3(...palette.c) }, uG4: { value: new THREE.Vector3(...palette.d) }, uFlowers: { value: palette.flowers === false ? 0 : 1 } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
    fragmentShader: /* glsl */ `
      ${COMMON}
      varying vec3 vW; uniform vec3 uG1,uG2,uG3,uG4; uniform float uFlowers;
      float aa(float x, float e){ float w = fwidth(x)*1.6 + .015; return smoothstep(e - w, e + w, x); }
      void main(){
        vec2 p = vW.xz; float dist = length(vW - cameraPosition);
        float n = fbm(p*.011), n2 = fbm(p*.045+7.), n3 = fbm(p*.2+3.);
        vec3 g1 = uG1, g2 = uG2, g3 = uG3, g4 = uG4;
        vec3 base = mix(g2, g1, aa(n,.46)); base = mix(base, g3, aa(n,.63)*.85); base = mix(base, g4, aa(n2,.72)*.55);
        float far = smoothstep(120.,600.,dist);
        base = mix(base, mix(g1,g2,.5), far*.6);
        float tuft = aa(n3,.62)*(1.-far); base *= 1.-.07*tuft;
        float fl = uFlowers*step(.988, hash21(floor(p*.7)))*(1.-smoothstep(30.,220.,dist))*(1.-smoothstep(.3,.45,length(fract(p*.7)-.5)));
        base *= 1. + (fbm(p*vec2(.03,.018) + vec2(-uTime*.13, uTime*.05)) - .5)*.24*(1.-smoothstep(40.,380.,dist));
        vec3 fc = mix(vec3(1.,.96,.78), vec3(1.,.72,.84), step(.5,hash21(floor(p*.7)+3.)));
        base = mix(base, fc, fl*.85);
        vec3 col = base*(uAmb*.5+uLightCol*.62);
        gl_FragColor = vec4(applyFog(col, dist), 1.);
      }`,
  }));
  m.frustumCulled = false;
  return m;
}
