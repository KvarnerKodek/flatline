import * as THREE from 'three';
import { COMMON, G, hex } from './toon';
import { HeightFn, noise2 } from './land';
import { SHADOW_GLSL } from './shadow';
import { ss } from './timeline';

/** Five octaves of `noise2`, 0 to 1, the same on every machine. */
export function fbm2(x: number, z: number): number {
  let a = 0.5, s = 0;
  for (let i = 0; i < 5; i++) { s += a * noise2(x, z); [x, z] = [x * 2.03 + 17.1, z * 2.03 + 9.2]; a *= 0.5; }
  return s;
}

/** A flat elliptical stand for a building or yard: level `y` inside the ellipse, blended into the ground over `soft` metres. */
export interface Site { x: number; z: number; rx: number; rz: number; y: number; soft?: number }

const ellipse = (x: number, z: number, s: Site) => Math.hypot((x - s.x) / s.rx, (z - s.z) / s.rz);

/** Levels `h` under every site. */
export const flattenSites = (h: HeightFn, sites: Site[]): HeightFn => (x, z) =>
  sites.reduce((y, s) => y + (s.y - y) * (1 - ss(1, 1 + (s.soft ?? 70) / s.rx, ellipse(x, z, s))), h(x, z));

/** True within `pad` radii of a site (1 is its edge). */
export const onSite = (sites: Site[], x: number, z: number, pad = 1.25) => sites.some((s) => ellipse(x, z, s) < pad);

/** Where things stand: the top of a site (plus `lift`), or the ground. */
export const standHeight = (h: HeightFn, sites: Site[], x: number, z: number, lift = 0.4) => {
  const s = sites.find((q) => ellipse(x, z, q) < 0.7);
  return s ? s.y + lift : h(x, z);
};

/** One broad swell of ground: `amp` metres at wavelength `scale`, `calm` (0 to 1+) keeps the valley floor quieter than its walls. */
export interface Relief { scale: number; amp: number; calm?: number }

export interface ValleyOpts {
  /** Centre line of the valley floor, x as a function of z. */
  axis?: (z: number) => number;
  /** Half-width of the flat floor and the distance at which the walls reach `rise`. */
  inner?: number; outer?: number; rise?: number;
  /** Steepness of the walls: above 1 they curve up gently from the floor. */
  power?: number;
  relief?: Relief[];
}

/** A valley height function: a floor along `axis`, walls rising to `rise` metres, and layered relief on top. */
export function valleyHeight(o: ValleyOpts = {}): HeightFn {
  const { axis = () => 0, inner = 150, outer = 800, rise = 100, power = 1.35, relief = [{ scale: 220, amp: 60, calm: 0.2 }, { scale: 75, amp: 14, calm: 0.25 }, { scale: 100, amp: 7, calm: 1 }] } = o;
  return (x, z) => {
    const side = ss(inner, outer, Math.abs(x - axis(z)));
    return relief.reduce((y, r, i) => y + (fbm2(x / r.scale + i * 3.7, z / r.scale + i * 1.9) - 0.5) * r.amp * ((r.calm ?? 1) + side), rise * Math.pow(side, power));
  };
}

/** `[from, to, step]`: grid lines every `step` metres. Coarse steps far away and fine ones near the action keep the mesh small. */
export type Band = [from: number, to: number, step: number];

/** Grid coordinates for consecutive bands; `to` is exclusive except for the last band. */
export function gridAxis(bands: Band[]): number[] {
  return bands.flatMap(([a, b, step], i) => {
    const out: number[] = [];
    for (let v = a; i === bands.length - 1 ? v <= b + 1e-9 : v < b - 1e-9; v += step) out.push(v);
    return out;
  });
}

export interface TerrainPalette {
  /** Four greens that patch the meadow, light to dark. */
  grass: [number, number, number, number];
  dry: number;
  rock: [number, number];
  path: number;
  /** Field colours, picked by cell; the first fifth of cells get the first colour, and so on. */
  fields: [number, number, number, number, number];
  fieldEdge: number;
  flowers: [number, number];
  /** Colour distant ground fades towards. */
  haze: number;
}

export const MEADOW_PALETTE: TerrainPalette = {
  grass: [0x94d166, 0x5eae59, 0xa8db70, 0x33856b], dry: 0xdbd199, rock: [0x9e9ebd, 0xd1bda3], path: 0xebd6ad,
  fields: [0xe0d6a3, 0xbcade0, 0x5cb39e, 0x94d175, 0x479970], fieldEdge: 0x387f5c, flowers: [0xfff5d6, 0xc7adff], haze: 0x8CA3E6,
};

export interface TerrainOpts {
  /** Ground height; sites are levelled into it. */
  height: HeightFn;
  x: Band[];
  z: Band[];
  /** Up to 8 flat stands; fields keep clear of them. */
  sites?: Site[];
  /** Painted tracks, up to 64 points in all. */
  paths?: { x: number; z: number }[][];
  /** Half-width of a track in metres. */
  pathWidth?: number;
  palette?: Partial<TerrainPalette>;
  /** Patchwork fields on gentle low ground (default on) and their cell size in metres. */
  fields?: boolean;
  cell?: [number, number];
  /** Fields grow only below this height. */
  fieldCeiling?: number;
  /** Flower specks near the camera (default on). */
  flowers?: boolean;
  /** Strength of drifting cloud shadow, 0 to 1. */
  cloudShadow?: number;
}

export interface PaintedTerrain { mesh: THREE.Mesh; height: HeightFn; stand(x: number, z: number): number; onSite(x: number, z: number, pad?: number): boolean }

export const MAX_PATH_POINTS = 64;
const MAX_SITES = 8;
const rgb = (h: number) => hex(h);

/**
 * One continuous painted landscape in a single mesh: meadow patches, optional patchwork fields, wildflowers, painted paths,
 * rock on steep ground, brush streaks and dabs that fade with distance, cloud shadow, sun shadows and a warm rim on the relief.
 * Set the film to `uWaterline = 0` unless a sea laps at y = 0.
 */
export function paintedTerrain(o: TerrainOpts): PaintedTerrain {
  const sites = (o.sites ?? []).slice(0, MAX_SITES), p: TerrainPalette = { ...MEADOW_PALETTE, ...o.palette };
  const height = flattenSites(o.height, sites), xs = gridAxis(o.x), zs = gridAxis(o.z), W = xs.length, H = zs.length;
  const pos = new Float32Array(W * H * 3), nrm = new Float32Array(W * H * 3), e = 3, n = new THREE.Vector3();
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const k = (j * W + i) * 3, x = xs[i], z = zs[j];
      pos.set([x, height(x, z), z], k);
      n.set(height(x - e, z) - height(x + e, z), 2 * e, height(x, z - e) - height(x, z + e)).normalize();
      nrm.set([n.x, n.y, n.z], k);
    }
  const idx: number[] = [];
  for (let j = 0; j < H - 1; j++) for (let i = 0; i < W - 1; i++) { const a = j * W + i, b = a + 1, c = a + W, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setIndex(idx);

  const pts = (o.paths ?? []).flatMap((line) => line.map((q, i) => new THREE.Vector4(q.x, q.z, i < line.length - 1 ? 1 : 0, 0))).slice(0, MAX_PATH_POINTS);
  while (pts.length < MAX_PATH_POINTS) pts.push(new THREE.Vector4());
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      ...G,
      uPath: { value: pts }, uPathW: { value: o.pathWidth ?? 5 },
      uSites: { value: Array.from({ length: MAX_SITES }, (_, i) => (sites[i] ? new THREE.Vector4(sites[i].x, sites[i].z, sites[i].rx, sites[i].rz) : new THREE.Vector4(0, 0, 1, 1))) },
      uGrass: { value: p.grass.map(rgb) }, uDry: { value: rgb(p.dry) }, uRock: { value: p.rock.map(rgb) }, uPathC: { value: rgb(p.path) },
      uFields: { value: p.fields.map(rgb) }, uFieldEdge: { value: rgb(p.fieldEdge) }, uFlowers: { value: p.flowers.map(rgb) }, uHaze: { value: rgb(p.haze) },
      uCell: { value: new THREE.Vector2(...(o.cell ?? [150, 115])) }, uFieldOn: { value: o.fields === false ? 0 : 1 }, uFieldMax: { value: o.fieldCeiling ?? 34 },
      uFlowerOn: { value: o.flowers === false ? 0 : 1 }, uCloud: { value: o.cloudShadow ?? 0.26 },
    },
    vertexShader: 'varying vec3 vW; varying vec3 vN; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; vN = normal; gl_Position = projectionMatrix*viewMatrix*w; }',
    fragmentShader: /* glsl */ `
      ${COMMON}
      ${SHADOW_GLSL}
      varying vec3 vW; varying vec3 vN;
      uniform vec4 uPath[${MAX_PATH_POINTS}]; uniform vec4 uSites[${MAX_SITES}]; uniform vec3 uGrass[4], uRock[2], uFields[5], uFlowers[2];
      uniform vec3 uDry, uPathC, uFieldEdge, uHaze; uniform vec2 uCell; uniform float uPathW, uFieldOn, uFieldMax, uFlowerOn, uCloud;
      float aa(float x, float e){ float w = fwidth(x)*1.6 + .015; return smoothstep(e - w, e + w, x); }
      float segDist(vec2 p, vec2 a, vec2 b){ vec2 pa=p-a, ba=b-a; float h=clamp(dot(pa,ba)/max(dot(ba,ba),1e-4),0.,1.); return length(pa-ba*h); }
      void main(){
        vec2 p = vW.xz; float dist = length(vW - cameraPosition);
        vec3 n = unit(vN);
        float n1 = fbm(p*.009), n2 = fbm(p*.04+7.), n3 = fbm(p*.22+3.);
        vec3 g1 = uGrass[0], g2 = uGrass[1], g3 = uGrass[2], g4 = uGrass[3];
        float detail = 1. - smoothstep(60.,260.,dist);
        vec3 base = mix(g2, g1, aa(n1,.46)); base = mix(base, g3, aa(n1,.63)*.8); base = mix(base, g4, aa(n2,.72)*.5*detail);
        base = mix(base, uDry, smoothstep(.55,.9,fbm(p*.0035+19.))*.25);
        vec2 wp = p + vec2(fbm(p*.004)*90., fbm(p*.004+5.)*90.); vec2 cell = floor(wp/uCell); float hid = hash21(cell), hid2 = hash21(cell+7.);
        vec3 fcol = hid < .2 ? uFields[0] : hid < .38 ? uFields[1] : hid < .52 ? uFields[2] : hid < .7 ? uFields[3] : uFields[4];
        float rows = .5 + .5*sin(dot(p, hid2 < .5 ? vec2(.9,.4) : vec2(-.4,.9))*.55);
        fcol *= .93 + .1*mix(.5, rows, 1.-smoothstep(60.,220.,dist));
        float farm = uFieldOn * (1.-smoothstep(uFieldMax*.26,uFieldMax,vW.y)) * (1.-smoothstep(.07,.16,1.-n.y)) * step(.25, hash21(cell+3.));
        float sd = 9.; for (int i=0;i<${MAX_SITES};i++){ vec4 s = uSites[i]; sd = min(sd, length((p - s.xy)/s.zw)); }
        farm *= smoothstep(1.15, 1.9, sd);
        base = mix(base, fcol, farm*.85);
        vec2 fq = fract(wp/uCell); float eg = min(min(fq.x,1.-fq.x)*uCell.x, min(fq.y,1.-fq.y)*uCell.y);
        base = mix(base, uFieldEdge, (1.-smoothstep(.5,1.7,eg))*smoothstep(.2,.7,farm)*.75);
        base = mix(base, mix(g3, g1, .5), smoothstep(uFieldMax*.5,uFieldMax*3.5,vW.y)*.35);
        float slope = 1.-n.y;
        base = mix(base, mix(uRock[0], uRock[1], n2), smoothstep(.2,.42,slope + (n3-.5)*.08*detail));
        float far = smoothstep(150.,900.,dist); base = mix(base, mix(g1,g2,.5)*vec3(.9,1.,1.05), far*.5); base = mix(base, uHaze, smoothstep(450.,1700.,dist)*.55);
        vec2 fc2 = floor(p*.55);
        float fl = uFlowerOn*step(.989, hash21(fc2))*(1.-smoothstep(18.,80.,dist))*(1.-smoothstep(.12,.2,slope))*(1.-smoothstep(.16,.26,length(fract(p*.55)-.5)));
        base = mix(base, mix(uFlowers[0], uFlowers[1], step(.5,hash21(fc2+3.))), fl*.9);
        float pd = 1e5; for (int i=0;i<${MAX_PATH_POINTS - 1};i++){ vec4 a = uPath[i]; if (a.z > .5) pd = min(pd, segDist(p, a.xy, uPath[i+1].xy)); }
        float road = 1.-smoothstep(uPathW,uPathW*1.44,pd), edge = smoothstep(uPathW*.8,uPathW,pd)*(1.-smoothstep(uPathW*1.04,uPathW*1.44,pd));
        vec3 pc = uPathC*mix(1., .94, n3); base = mix(base, pc*.92, edge*.6); base = mix(base, pc, road*(1.-smoothstep(.15,.3,slope)));
        float cs = smoothstep(.52,.74, fbm(p*.0021 + vec2(uTime*.012, uTime*.004) + 31.)); base *= (1. - uCloud*cs*(1.-uNight)*smoothstep(80.,500.,dist)) * (1. + .05*(1.-cs));
        float pm = 1.-smoothstep(150.,520.,dist), pw = 1.-smoothstep(500.,1500.,dist);
        float brush = fbm(vec2(dot(p, vec2(.8,.6))*.16, dot(p, vec2(-.6,.8))*.035) + 11.);
        float dab = fbm(p*vec2(.5,.16) + 23.);
        base *= mix(vec3(.93,.98,1.05), vec3(1.07,1.03,.9), fbm(p*.0028+4.)) * (1. + (brush-.5)*.3*pm + (dab-.5)*.16*pm);
        base = mix(base, base*vec3(1.1,1.06,.78), smoothstep(.58,.74,dab)*.45*pm*(1.-farm*.5));
        base = mix(base, base*vec3(.82,.95,1.02), smoothstep(.42,.28,brush)*.4*pw);
        float nl = dot(n, uLightDir);
        float wn = fwidth(nl)*1.5 + .02; float b1 = smoothstep(-.3-wn,.12+wn,nl), b2 = smoothstep(.3-wn,.5+wn,nl);
        float sh = smoothstep(.12,.88,sunShadow(vW, n, nl)); b1 *= 1.-.6*sh; b2 *= 1.-sh;
        vec3 shade = base*mix(uShadow*.9+uAmb*.2, vec3(.78,.8,.9), .5), mid = base*(uAmb*.5+uLightCol*.42), lit = base*(uAmb*.32+uLightCol*.78);
        vec3 col = mix(shade, mid, b1); col = mix(col, lit, b2);
        col += uShadow*.2*(smoothstep(-.1,.0,nl)-smoothstep(.0,.1,nl))*base;
        col *= mix(vec3(1.), vec3(.66,.7,.9), sh);
        float rim = pow(1.-clamp(dot(n, normalize(cameraPosition - vW)), 0., 1.), 3.);
        col += vec3(1.,.88,.58)*rim*.2*smoothstep(-.1,.5,nl)*(1.-smoothstep(600.,1800.,dist));
        gl_FragColor = vec4(applyFog(col, dist), 1.);
      }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.userData.noShadow = true;
  return { mesh, height, stand: (x, z) => standHeight(height, sites, x, z), onSite: (x, z, pad) => onSite(sites, x, z, pad) };
}
