import * as THREE from 'three';

export const hex = (h: number) => new THREE.Vector3(((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255);

export const G = {
  uTime: { value: 0 },
  uLightDir: { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() },
  uLightCol: { value: new THREE.Vector3(1, 1, 1) },
  uAmb: { value: new THREE.Vector3(0.3, 0.3, 0.4) },
  uShadow: { value: new THREE.Vector3(0.4, 0.45, 0.7) },
  uRim: { value: new THREE.Vector3(0.4, 0.6, 1) },
  uFog: { value: new THREE.Vector3(0.1, 0.2, 0.3) },
  uFogD: { value: 0.002 },
  uNight: { value: 1 },
  uRes: { value: new THREE.Vector2(1, 1) },
  uSea: { value: 1 },
  /** 1 darkens surfaces near y = 0 as if a sea lapped at them; set 0 for a film on dry land. */
  uWaterline: { value: 1 },
  uShadowMap: { value: null as THREE.Texture | null },
  uShadowMat: { value: new THREE.Matrix4() },
  uShadowMapN: { value: null as THREE.Texture | null },
  uShadowMatN: { value: new THREE.Matrix4() },
  uShadowOn: { value: 0 },
  uShadowTexel: { value: 1 / 4096 },
};

export const COMMON = /* glsl */ `
uniform float uTime, uFogD, uNight, uSea, uWaterline;
uniform vec3 uLightDir, uLightCol, uAmb, uShadow, uRim, uFog;
uniform vec2 uRes;
float hash11(float p){ p = fract(p*.1031); p *= p+33.33; p *= p+p; return fract(p); }
float hash21(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x),f.y); }
float fbm(vec2 p){ float a=.5,s=0.; for(int i=0;i<5;i++){ s+=a*vnoise(p); p=p*2.03+vec2(17.1,9.2); a*=.5; } return s; }
vec3 applyFog(vec3 c, float d){ float f = 1.-exp(-pow(d*uFogD,1.35)); return mix(c, uFog, clamp(f,0.,1.)); }
`;

const TOON_VS = /* glsl */ `
varying vec3 vN; varying vec3 vW; varying vec3 vC; varying vec4 vS; varying vec4 vSN;
uniform mat4 uShadowMat, uShadowMatN;
#ifdef ICOL
attribute vec3 iColor;
#endif
void main(){
  vec4 p = vec4(position,1.); vec3 n = normal;
  #ifdef USE_INSTANCING
  p = instanceMatrix*p; n = mat3(instanceMatrix)*n;
  #endif
  vec4 w = modelMatrix*p; vW = w.xyz; vN = normalize(mat3(modelMatrix)*n);
  vC = vec3(1.);
  #ifdef USE_COLOR
  vC = color;
  #endif
  #ifdef ICOL
  vC = iColor;
  #endif
  vS = uShadowMat*vec4(w.xyz + vN*.16, 1.);
  vSN = uShadowMatN*vec4(w.xyz + vN*.05, 1.);
  gl_Position = projectionMatrix*viewMatrix*w;
}`;

const TOON_FS = /* glsl */ `
${COMMON}
varying vec3 vN; varying vec3 vW; varying vec3 vC; varying vec4 vS; varying vec4 vSN;
uniform vec3 uBase; uniform float uVC, uEmis, uSpec, uAlpha, uEmisN, uGrain, uShadowOn;
uniform vec3 uEmisCol; uniform sampler2D uShadowMap, uShadowMapN; uniform float uShadowTexel;
float lookup(sampler2D map, vec4 at, float nl, float scale){
  vec3 p = at.xyz/at.w*.5+.5;
  float bias = (.00004 + .00022*(1.-clamp(abs(nl), 0., 1.)))*scale, s = 0.;
  for (int i=-1;i<=1;i++) for (int j=-1;j<=1;j++) s += step(texture2D(map, p.xy + vec2(float(i), float(j))*uShadowTexel*1.25).r + bias, p.z);
  return smoothstep(.2, .8, s/9.);
}
float sunShadow(float nl){
  if (uShadowOn < .5) return 0.;
  vec3 n = vSN.xyz/vSN.w*.5+.5, f = vS.xyz/vS.w*.5+.5;
  float inNear = smoothstep(0., .06, min(min(n.x, 1.-n.x), min(n.y, 1.-n.y)));
  float edge = smoothstep(0., .05, min(min(f.x, 1.-f.x), min(f.y, 1.-f.y)));
  float far = f.z > 1. ? 0. : lookup(uShadowMap, vS, nl, 1.)*edge;
  return inNear > 0. ? mix(far, lookup(uShadowMapN, vSN, nl, .25), inNear) : far;
}
void main(){
  vec3 base = mix(uBase, vC, uVC);
  base *= 1. + uGrain*((step(.5, vnoise(vW.xz*.55))-.5)*.07 + (vnoise(vW.xz*.07)-.5)*.16 + (step(.62, vnoise(vW.xz*2.3+7.))-.3)*.035);
  vec3 n = normalize(vN); if(!gl_FrontFacing) n = -n;
  vec3 v = normalize(cameraPosition - vW);
  float nl = dot(n, uLightDir);
  nl = mix(nl, min(nl, -.2), nl > 0. ? sunShadow(nl) : 0.);
  float hemi = n.y*.5+.5;
  float b1 = smoothstep(-.06,.0,nl), b2 = smoothstep(.34,.4,nl);
  vec3 shade = base*(uShadow*(.7+.3*hemi)+uAmb*.22);
  vec3 mid = base*(uAmb*.5+uLightCol*.42);
  vec3 lit = base*(uAmb*.3+uLightCol*.78);
  float ex = 1.-.34*uNight; mid *= ex; lit *= ex; shade *= 1.-.2*uNight;
  vec3 col = mix(shade, mid, b1); col = mix(col, lit, b2);
  float edge1 = smoothstep(-.06,.0,nl) - smoothstep(.0,.06,nl);
  col += uShadow*.35*edge1*base;
  float wl = smoothstep(-.2,1.1,vW.y);
  col *= mix(1., mix(.72, 1., wl), uWaterline);
  col = mix(col, col*vec3(1.04,1.0,.94), b2*.6);
  float rim = pow(1.-max(dot(n,v),0.),3.);
  col += uRim*smoothstep(.46,.52,rim)*(.3+.7*hemi)*mix(.38,.75,uNight);
  vec3 h = normalize(uLightDir+v);
  col += uLightCol*step(.55,pow(max(dot(n,h),0.),70.))*uSpec;
  col += uEmisCol*uEmis*(1.+uEmisN*uNight);
  float d = length(cameraPosition - vW);
  col = applyFog(col, d);
  gl_FragColor = vec4(col, uAlpha);
}`;

export interface ToonOpts {
  color?: number;
  vertexColors?: boolean;
  instanceColors?: boolean;
  emissive?: number;
  emisAmt?: number;
  emisNight?: number;
  spec?: number;
  alpha?: number;
  side?: THREE.Side;
  /** Painted variation across the ground plane, for land and other broad surfaces. */
  grain?: number;
}

export function toon(o: ToonOpts = {}): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      ...G,
      uBase: { value: hex(o.color ?? 0xffffff) },
      uVC: { value: o.vertexColors || o.instanceColors ? 1 : 0 },
      uEmis: { value: o.emisAmt ?? 0 },
      uEmisN: { value: o.emisNight ?? 0 },
      uEmisCol: { value: hex(o.emissive ?? 0xffffff) },
      uSpec: { value: o.spec ?? 0.1 },
      uAlpha: { value: o.alpha ?? 1 },
      uGrain: { value: o.grain ?? 0 },
    },
    vertexShader: TOON_VS,
    fragmentShader: TOON_FS,
    side: o.side ?? THREE.FrontSide,
    transparent: (o.alpha ?? 1) < 1,
    depthWrite: (o.alpha ?? 1) >= 1,
  });
  m.vertexColors = !!o.vertexColors;
  if (o.instanceColors) m.defines = { ICOL: '' };
  return m;
}

export const INK = hex(0x050a14);

export function outline(px = 2.2): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...G, uPx: { value: px }, uInk: { value: INK } },
    vertexShader: /* glsl */ `
      uniform vec2 uRes; uniform float uPx;
      varying vec3 vW;
      void main(){
        vec4 w = modelMatrix*vec4(position,1.);
        vW = w.xyz;
        vec4 clip = projectionMatrix*viewMatrix*w;
        vec3 nv = mat3(viewMatrix)*(mat3(modelMatrix)*normal);
        vec2 dir = normalize(nv.xy + 1e-5);
        float px = uPx*clamp(7./clip.w, .3, 1.);
        clip.xy += dir * (2.*px) / uRes * clip.w;
        gl_Position = clip;
      }`,
    fragmentShader: /* glsl */ `
      ${COMMON}
      uniform vec3 uInk; varying vec3 vW;
      void main(){ vec3 ink = mix(uInk*vec3(1.5,1.2,1.0)+vec3(.05,.03,.02), uInk*vec3(.9,1.1,1.8), uNight); gl_FragColor = vec4(applyFog(ink, length(cameraPosition-vW)), 1.); }`,
    side: THREE.BackSide,
  });
}

export function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.18, 'rgba(255,255,255,.55)');
  r.addColorStop(0.5, 'rgba(255,255,255,.12)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

let GLOW: THREE.Texture | null = null;
export function glow(color: number, size: number, intensity = 1): THREE.Sprite {
  GLOW ??= glowTexture();
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: GLOW, color: new THREE.Color().setRGB(...hex(color).toArray() as [number, number, number], THREE.LinearSRGBColorSpace), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: intensity, fog: false }),
  );
  s.scale.setScalar(size);
  return s;
}

export function inked(geo: THREE.BufferGeometry, mat: THREE.Material, px = 2.2, outlineMat?: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(geo, mat);
  g.add(mesh);
  const o = new THREE.Mesh(geo, outlineMat ?? outline(px));
  g.add(o);
  return g;
}
