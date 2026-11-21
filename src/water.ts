import * as THREE from 'three';
import { G, COMMON } from './toon';
import type { Mood } from './mood';

export const WAVES = [
  { dx: 0.92, dz: 0.38, a: 0.34, l: 38 },
  { dx: 0.55, dz: -0.83, a: 0.2, l: 21 },
  { dx: -0.3, dz: 0.95, a: 0.1, l: 11 },
  { dx: 0.98, dz: -0.2, a: 0.06, l: 6.3 },
  { dx: -0.7, dz: -0.7, a: 0.035, l: 3.4 },
];
const GRAV = 9.81;
const wk = (l: number) => (Math.PI * 2) / l;

export function waveHeight(x: number, z: number, t: number, sea = 1): number {
  let h = 0;
  for (const w of WAVES) {
    const k = wk(w.l), c = Math.sqrt(GRAV / k);
    h += w.a * sea * Math.sin(k * (w.dx * x + w.dz * z) - k * c * t);
  }
  return h;
}

export function waveSlope(x: number, z: number, t: number, sea = 1): [number, number] {
  let sx = 0, sz = 0;
  for (const w of WAVES) {
    const k = wk(w.l), c = Math.sqrt(GRAV / k);
    const d = w.a * sea * k * Math.cos(k * (w.dx * x + w.dz * z) - k * c * t);
    sx += d * w.dx;
    sz += d * w.dz;
  }
  return [sx, sz];
}

const MAX_WAKES = 8;
export const wakeU = { value: Array.from({ length: MAX_WAKES }, () => new THREE.Vector4(0, 0, 0, 0)) };
export const wakeCount = { value: 0 };
export const wakeS = { value: new Array(MAX_WAKES).fill(1) as number[] };

const GLSL_WAVES = WAVES.map((w, i) => {
  const k = wk(w.l), c = Math.sqrt(GRAV / k);
  return `{ float k=${k.toFixed(5)}, c=${c.toFixed(5)}; vec2 d=vec2(${w.dx},${w.dz}); float ph=k*dot(d,p)-k*c*uTime; float A=${w.a}*uSea*fade;
    h += A*sin(ph); dd += A*k*cos(ph)*d; }`;
}).join('\n');

export const holeU = { value: new THREE.Vector3() };

const U = {
  uDeep: { value: new THREE.Vector3() }, uShallow: { value: new THREE.Vector3() }, uHorizon: { value: new THREE.Vector3() }, uZenith: { value: new THREE.Vector3() },
  uSky: { value: new THREE.Vector3() }, uSunCol: { value: new THREE.Vector3() }, uMoonish: { value: 1 },
  uWakes: wakeU, uWakeN: wakeCount, uWakeS: wakeS, uHole: holeU,
};

export function makeWater(): THREE.Mesh {
  const rings = 110, seg = 160, r0 = 4, r1 = 14000;
  const pos: number[] = [], idx: number[] = [];
  const grow = Math.pow(r1 / r0, 1 / (rings - 1));
  pos.push(0, 0, 0);
  for (let i = 0; i < rings; i++) {
    const r = r0 * Math.pow(grow, i);
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      pos.push(Math.cos(a) * r, 0, Math.sin(a) * r);
    }
  }
  for (let j = 0; j < seg; j++) idx.push(0, 1 + ((j + 1) % seg), 1 + j);
  for (let i = 0; i < rings - 1; i++)
    for (let j = 0; j < seg; j++) {
      const a = 1 + i * seg + j, b = 1 + i * seg + ((j + 1) % seg), c = a + seg, d = b + seg;
      idx.push(a, b, c, b, d, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
    uniforms: { ...G, ...U },
    vertexShader: /* glsl */ `
      ${COMMON}
      varying vec3 vW; varying float vH;
      void main(){
        vec4 w = modelMatrix*vec4(position,1.);
        vec2 p = w.xz;
        float dist = length(w.xz - cameraPosition.xz);
        float fade = 1.-smoothstep(260.,900.,dist);
        float h = 0.; vec2 dd = vec2(0.);
        ${GLSL_WAVES}
        w.y += h; vW = w.xyz; vH = h;
        gl_Position = projectionMatrix*viewMatrix*w;
      }`,
    fragmentShader: /* glsl */ `
      ${COMMON}
      varying vec3 vW; varying float vH;
      uniform vec3 uDeep,uShallow,uHorizon,uZenith,uSky,uSunCol;
      uniform vec4 uWakes[${MAX_WAKES}]; uniform float uWakeS[${MAX_WAKES}]; uniform int uWakeN; uniform vec3 uHole;
      void main(){
        vec2 p = vW.xz;
        if (length(p-uHole.xy) < uHole.z) discard;
        float dist = length(vW - cameraPosition);
        float fade = 1.-smoothstep(260.,900.,length(vW.xz-cameraPosition.xz));
        float h = 0.; vec2 dd = vec2(0.);
        ${GLSL_WAVES}
        // fine ripples
        vec2 q = p*.8; float rp = vnoise(q + uTime*vec2(.35,.2)) + vnoise(q*2.1 - uTime*vec2(.2,.4))*.5;
        vec2 rn = vec2(vnoise(q+vec2(.1,0.)+uTime*.2)-vnoise(q-vec2(.1,0.)+uTime*.2), vnoise(q+vec2(0.,.1)-uTime*.2)-vnoise(q-vec2(0.,.1)-uTime*.2))*.35*uSea;
        vec3 n = normalize(vec3(-dd.x-rn.x, 1., -dd.y-rn.y));
        vec3 v = normalize(cameraPosition - vW);
        float nv = clamp(dot(n,v),0.,1.);
        float fres = pow(1.-nv, 4.);
        float skyMix = clamp(fres*1.35, 0., 1.);
        vec3 base = mix(uDeep, uShallow, smoothstep(-.35,.45,vH)*.4 + .4 + .1*rp);
        vec3 refl = mix(uSky*.9, uHorizon, smoothstep(.0,.9,fres));
        vec3 col = mix(base, refl, skyMix);
        float hn0 = vH/(.5*max(uSea,.3));
        col *= .93+.07*smoothstep(-.7,.7,hn0);
        // glitter path toward the light: soft streaks quantised to two levels
        vec3 r = reflect(-v, n);
        float s = max(dot(r, uLightDir), 0.);
        float g1 = smoothstep(.986-.004*uNight,.9985,s)*(.5+.5*vnoise(p*1.1+uTime*.3));
        float glint = step(.5,g1)*.3 + step(.84,g1)*.35;
        col += uSunCol*glint*(.9+.45*uNight)*smoothstep(10.,90.,dist);
        // crest strokes: thin drawn foam marks on the higher swells
        float hn = vH/(.5*max(uSea,.3));
        float rd = 1.-abs(2.*vnoise(p*vec2(.8,1.35)+vec2(uTime*.18,-uTime*.05))-1.);
        float rw = fwidth(rd)*1.4+.004;
        float stroke = smoothstep(.945-rw,.945+rw,rd)*smoothstep(.1,.5,hn)*(1.-smoothstep(60.,420.,dist)*.8);
        col = mix(col, mix(uHorizon,vec3(1.),.5)*(.82+.18*(1.-uNight)), stroke*.75*fade*(1.-skyMix*.5));
        // boat wakes
        float foam = 0.;
        for (int i=0;i<${MAX_WAKES};i++){
          if (i>=uWakeN) break;
          vec4 B = uWakes[i]; float WS = uWakeS[i];
          vec2 f = vec2(cos(B.z), sin(B.z));
          vec2 rel = p - B.xy;
          float along = dot(rel, f), side = dot(rel, vec2(-f.y, f.x));
          float back = -along/WS; side /= WS;
          if (back > -1.5 && back < 60. && B.w > .1) {
            float spread = .15 + back*.26;
            float ks = side/(.55+back*.05), vs = (abs(side)-spread*back*.55-.6)/(.45+back*.035);
            float kel = exp(-ks*ks)*smoothstep(-1.5,1.,back)*(1.-smoothstep(10.,60.,back));
            float vee = exp(-vs*vs)*smoothstep(0.,4.,back)*(1.-smoothstep(25.,85.,back));
            float n1 = vnoise(vec2(back*.55, side*1.2)+uTime*.6);
            foam += clamp(kel*.9*smoothstep(.3,.5,n1) + vee*.55*smoothstep(.25,.55,vnoise(vec2(back*.3,side*.9))),0.,1.) * clamp(B.w*.5,.25,1.);
          }
        }
        col = mix(col, vec3(.92,.97,1.)*(.55+.45*(1.-uNight*.5)), clamp(foam,0.,1.)*.85);
        col = applyFog(col, dist);
        gl_FragColor = vec4(col, 1.);
      }`,
  }));
  m.frustumCulled = false;
  return m;
}

export function updateWater(m: Mood) {
  U.uDeep.value.copy(m.deep); U.uShallow.value.copy(m.shallow); U.uHorizon.value.copy(m.horizon); U.uZenith.value.copy(m.zenith);
  U.uSky.value.copy(m.mid).lerp(m.horizon, 0.45);
  U.uSunCol.value.copy(m.moon > 0.5 ? new THREE.Vector3(0.85, 0.92, 1) : new THREE.Vector3(1, 0.86, 0.6));
}
