import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { G, INK, UNIT } from './toon';

/**
 * Screen-space ink: lines from depth discontinuities and normal creases of an opaque depth/normal pass.
 * Skip an object (and its children) with `userData.noEdge = true`; transparent, additive, sprite, line and point
 * objects are always skipped. Meshes whose material has `defines.SWAY` or `FADE` (foliage) get lighter lines.
 * A see-through mesh veils the lines and haze behind it if its material has a `uVeil` uniform and, while that is 1,
 * draws its linear view depth in rgb and its coverage in alpha (see `Puffs`).
 */
export interface EdgeOpts {
  /** overall line opacity, 0 to 1 */
  strength?: number;
  /** line width in pixels at 720p, scaled with the render height */
  thickness?: number;
  /** relative inverse-depth jump that starts a silhouette line */
  depth?: number;
  /** normal change (1 - dot) that starts a crease line */
  normal?: number;
  /** camera distance where lines start to fade and where they vanish */
  fade?: [near: number, far: number];
  /** line strength multiplier on foliage */
  foliage?: number;
  /** keep the inverted-hull outlines as well */
  hulls?: boolean;
  /** contact shadow in creases and under overhangs, 0 off to 1 strong */
  ao?: number;
  /** reach of the contact shadow in metres */
  aoRadius?: number;
  /** 0 uniform lines, 1 thick close up and fine far away */
  taper?: number;
}

export const DEFAULT_EDGES: Required<EdgeOpts> = { strength: 0.85, thickness: 1.1, depth: 0.04, normal: 0.55, fade: [260, 1500], foliage: 0.5, hulls: false, ao: 0.4, aoRadius: 1.4, taper: 0.7 };

/**
 * The material whose settings a mesh is drawn with in the depth pass, or nothing if it stays out (see-through or
 * additive). A mesh with several materials, such as a coin with a face and a rim, is drawn when all of them are opaque.
 */
export function depthSource(m: THREE.Material | THREE.Material[] | undefined): THREE.Material | undefined {
  const list = Array.isArray(m) ? m : m ? [m] : [];
  if (!list.length || list.some((x) => x.transparent || x.blending === THREE.AdditiveBlending || x.opacity < 1)) return undefined;
  return list[0];
}

export const resolveEdges = (o: EdgeOpts = {}): Required<EdgeOpts> => ({ ...DEFAULT_EDGES, ...o });
/** Line width in device pixels for a render of `heightPx` pixels, so 1080p lines look like 720p lines. */
export const edgePx = (thickness: number, heightPx: number) => (thickness * heightPx) / 720;
/** Line weight from a relative inverse-depth jump: 0 below `k`, 1 at `2k`. */
export const edgeWeight = (jump: number, k: number) => { const t = Math.min(1, Math.max(0, (jump - k) / k)); return t * t * (3 - 2 * t); };
/** Line width multiplier at view depth `z`: 1 + 0.6 `taper` nearby, 1 - 0.5 `taper` far away. */
export const edgeTaper = (z: number, taper: number) => { const t = Math.min(1, Math.max(0, (z - 20) / 380)); return 1 + taper * (0.6 - 1.1 * t * t * (3 - 2 * t)); };
/** 1 inside `near`, 0 beyond `far`. */
export const distanceFade = (z: number, [near, far]: [number, number]) => { const t = Math.min(1, Math.max(0, (z - near) / (far - near))); return 1 - t * t * (3 - 2 * t); };

/** Aerial perspective and valley fog applied in the edge pass from the depth buffer. */
export interface HazeOpts {
  /** distance haze start and full distance, metres */
  range?: [near: number, far: number];
  /** peak haze mix, 0 to 1 */
  strength?: number;
  /** haze colour, blended over the mood fog colour */
  tint?: [number, number, number];
  /** share of `tint` in the haze colour */
  tintMix?: number;
  /** nearby colour saturation boost, fading out by `range[1]` */
  nearSat?: number;
  /** ground fog: world height of the fog top and its strength */
  fogTop?: number;
  fogStrength?: number;
  /** fog layer is dense below fogTop and falls off over this many metres */
  fogFall?: number;
}
/** Per-frame ground fog: dense below `top`, fading to nothing `fall` metres higher (`strength` 0 turns it off). */
export const setGroundFog = (top: number, strength: number, fall = 40) => { H.uFogTop.value = top; H.uFogK.value = strength; H.uFogFall.value = fall; };

export const DEFAULT_HAZE: Required<HazeOpts> = { range: [180, 2600], strength: 0.5, tint: [0.72, 0.76, 0.98], tintMix: 0.35, nearSat: 0.1, fogTop: 0, fogStrength: 0, fogFall: 40 };

export const H = {
  uHazeR: { value: new THREE.Vector2(180, 2600) },
  uHazeK: { value: 0.5 },
  uHazeTint: { value: new THREE.Vector3(0.72, 0.76, 0.98) },
  uHazeMix: { value: 0.35 },
  uNearSat: { value: 0.1 },
  uFogTop: { value: 0 },
  uFogK: { value: 0 },
  uFogFall: { value: 40 },
};
/** Set haze for the current frame; unspecified fields keep their defaults. Safe to call every frame. */
export const setHaze = (o: HazeOpts = {}) => {
  const h = { ...DEFAULT_HAZE, ...o };
  H.uHazeR.value.set(...h.range); H.uHazeK.value = h.strength; H.uHazeTint.value.set(...h.tint); H.uHazeMix.value = h.tintMix; H.uNearSat.value = h.nearSat;
  H.uFogTop.value = h.fogTop; H.uFogK.value = h.fogStrength; H.uFogFall.value = h.fogFall;
};

const DEPTH_FS = /* glsl */ `
${UNIT}
varying vec3 vN; varying vec3 vW; uniform float uFol;
void main(){
  vec3 n = unit(vN); if (!gl_FrontFacing) n = -n;
  vec3 vn = mat3(viewMatrix)*n;
  gl_FragColor = vec4(vn.xy, uFol, -(viewMatrix*vec4(vW,1.)).z);
}`;
const PLAIN_VS = /* glsl */ `
${UNIT}
varying vec3 vN; varying vec3 vW;
void main(){
  vec4 p = vec4(position,1.); vec3 n = normal;
  #ifdef USE_INSTANCING
  p = instanceMatrix*p; n = mat3(instanceMatrix)*n;
  #endif
  vec4 w = modelMatrix*p; vW = w.xyz; vN = unit(mat3(modelMatrix)*n);
  gl_Position = projectionMatrix*viewMatrix*w;
}`;

const EDGE = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null }, tData: { value: null as THREE.Texture | null }, tVeil: { value: null as THREE.Texture | null },
    uTexel: { value: new THREE.Vector2(1 / 1280, 1 / 720) }, uPx: { value: 1.1 }, uStrength: { value: 0.85 }, uDepthK: { value: 0.04 }, uNormK: { value: 0.55 },
    uFade: { value: new THREE.Vector2(260, 1500) }, uFol: { value: 0.5 }, uEdges: { value: 1 }, uAO: { value: 0.4 }, uAOR: { value: 1.4 }, uTaper: { value: 0.7 },
    uTan: { value: new THREE.Vector2(1, 1) }, uCamW: { value: new THREE.Matrix4() },
    uInk: { value: INK }, uFog: G.uFog, uNight: G.uNight,
    ...H,
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse, tData, tVeil; uniform vec2 uTexel, uFade, uTan, uHazeR; uniform float uPx, uStrength, uDepthK, uNormK, uFol, uEdges, uNight, uAO, uAOR, uTaper, uHazeK, uHazeMix, uNearSat, uFogTop, uFogK, uFogFall;
    uniform vec3 uInk, uFog, uHazeTint; uniform mat4 uCamW; varying vec2 vUv;
    vec3 nrm(vec4 d){ return vec3(d.xy, sqrt(max(0., 1.-dot(d.xy,d.xy)))); }
    float inv(vec4 d){ return d.w > 0. ? 1./d.w : 0.; }
    float cr(vec3 nc, vec4 s, float ic){ return (1.-dot(nc, nrm(s)))*(1.-smoothstep(uDepthK, 2.*uDepthK, abs(inv(s)-ic)/ic)); }
    vec3 viewPos(vec2 uv, float z){ return vec3((uv*2.-1.)*uTan*z, -z); }
    void main(){
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      vec4 c = texture2D(tData, vUv);
      if (c.w <= 0.) { gl_FragColor = vec4(col, 1.); return; }
      float z = c.w;
      vec4 vl = texture2D(tVeil, vUv);
      float veil = vl.a > 0. ? vl.a*step(vl.r/vl.a, z) : 0.;
      vec3 wp = (uCamW*vec4((vUv*2.-1.)*uTan*z, -z, 1.)).xyz;
      float sat = 1.+uNearSat*(1.-smoothstep(uHazeR.x*.5, uHazeR.y*.5, z));
      col = mix(vec3(dot(col, vec3(.299,.587,.114))), col, sat);
      vec3 hc = mix(uFog, uHazeTint, uHazeMix);
      float hz = uHazeK*smoothstep(uHazeR.x, uHazeR.y, z);
      float gf = uFogK*(1.-smoothstep(uFogTop-uFogFall, uFogTop, wp.y))*(1.-exp(-z*.004));
      col = mix(col, hc, clamp(hz+gf, 0., .92)*(1.-veil));
      vec3 nc = nrm(c);
      if (uAO > 0. && z < 420.) {
        vec3 pc = viewPos(vUv, z);
        float rp = clamp(uAOR/(2.*z*uTan.y)/uTexel.y, 2., 36.), occ = 0.;
        for (int i=0;i<8;i++){
          float a = float(i)*2.39996, k = float(i+1)/8.;
          vec2 uv = vUv + vec2(cos(a), sin(a))*rp*(.3+.7*k)*uTexel;
          float zs = texture2D(tData, uv).w;
          if (zs <= 0.) continue;
          vec3 v = viewPos(uv, zs) - pc; float dl = length(v);
          occ += max(0., dot(nc, v/dl) - .2)*(1.-smoothstep(uAOR, 2.2*uAOR, dl));
        }
        occ = smoothstep(.0, .55, occ/4.)*(1.-smoothstep(80., 420., z))*uAO;
        col *= 1. - occ*(1.-vec3(.66,.7,.92)*.9);
      }
      if (uEdges > 0.) {
        vec2 o = uTexel*uPx*(1.+uTaper*(.6-1.1*smoothstep(20.,400.,z)));
        vec4 l = texture2D(tData, vUv-vec2(o.x,0.)), r = texture2D(tData, vUv+vec2(o.x,0.)), d = texture2D(tData, vUv-vec2(0.,o.y)), u = texture2D(tData, vUv+vec2(0.,o.y));
        float ic = 1./z;
        float jump = max(max(0., 2.*ic-inv(l)-inv(r)), max(0., 2.*ic-inv(d)-inv(u)))/ic;
        float w = smoothstep(uDepthK, 2.*uDepthK, jump);
        float crease = max(max(cr(nc, l, ic), cr(nc, r, ic)), max(cr(nc, d, ic), cr(nc, u, ic)));
        w = max(w, .7*smoothstep(uNormK, 2.*uNormK, crease));
        float thin = max(step(inv(l), ic*(1.-uDepthK))*step(inv(r), ic*(1.-uDepthK)), step(inv(d), ic*(1.-uDepthK))*step(inv(u), ic*(1.-uDepthK)));
        w *= (1.-.45*thin)*mix(1., uFol, c.z);
        float t = clamp((z-uFade.x)/(uFade.y-uFade.x), 0., 1.);
        w *= (1.-t*t*(3.-2.*t))*uStrength;
        vec3 ink = mix(uInk*vec3(1.5,1.2,1.)+vec3(.05,.03,.02), uInk*vec3(.9,1.1,1.8), uNight);
        ink = mix(col*col*.5, ink, .5);
        ink = mix(ink, hc*.8, hz*.8);
        col = mix(col, ink, w*(1.-veil));
      }
      gl_FragColor = vec4(col, 1.);
    }`,
};

interface Item { o: THREE.Mesh; mat: THREE.Material | THREE.Material[] }

/**
 * Composer pass: renders view-space normal, foliage flag and linear depth of the opaque scene, then draws
 * ink lines and depth haze over the colour buffer.
 */
export class EdgePass extends Pass {
  private target = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  private veil = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  private veils: THREE.Mesh[] = [];
  private quad: FullScreenQuad;
  private mat: THREE.ShaderMaterial;
  private derived = new WeakMap<THREE.Material, THREE.Material>();
  private plain: THREE.ShaderMaterial;
  private swaps: Item[] = [];
  private hidden: THREE.Object3D[] = [];
  private hulls: THREE.Object3D[] = [];
  private cleared = new THREE.Color(0, 0, 0);
  opts: Required<EdgeOpts>;
  lines = true;
  constructor(private scene: THREE.Scene, private camera: THREE.PerspectiveCamera, opts: EdgeOpts = {}) {
    super();
    this.opts = resolveEdges(opts);
    this.mat = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(EDGE.uniforms), vertexShader: EDGE.vertexShader, fragmentShader: EDGE.fragmentShader, depthTest: false, depthWrite: false });
    Object.assign(this.mat.uniforms, { uInk: { value: INK }, uFog: G.uFog, uNight: G.uNight, ...H });
    this.quad = new FullScreenQuad(this.mat);
    this.plain = new THREE.ShaderMaterial({ uniforms: { uFol: { value: 0 } }, vertexShader: PLAIN_VS, fragmentShader: DEPTH_FS });
  }

  setSize(w: number, h: number) {
    this.target.setSize(w, h);
    this.veil.setSize(w, h);
    this.mat.uniforms.uTexel.value.set(1 / w, 1 / h);
    this.mat.uniforms.uPx.value = edgePx(this.opts.thickness, h);
  }

  private depthMat(m: THREE.Material, foliage: boolean): THREE.Material {
    let d = this.derived.get(m);
    if (d) return d;
    const sm = m as THREE.ShaderMaterial;
    const toonLike = sm.isShaderMaterial && /varying vec3 vN/.test(sm.vertexShader) && /varying vec3 vW/.test(sm.vertexShader);
    d = toonLike
      ? new THREE.ShaderMaterial({ uniforms: { ...sm.uniforms, uFol: { value: foliage ? 1 : 0 } }, vertexShader: sm.vertexShader, fragmentShader: DEPTH_FS, defines: sm.defines, side: sm.side })
      : this.plain.clone();
    d.side = m.side;
    this.derived.set(m, d);
    return d;
  }

  private skipped(o: THREE.Object3D): boolean {
    return !(o as THREE.Mesh).isMesh || !depthSource((o as THREE.Mesh).material);
  }

  /** Collect what the depth pass draws and hide the hull outlines. Call once per frame before the composer renders. */
  scan() {
    this.swaps.length = 0; this.hidden.length = 0; this.veils.length = 0;
    const walk = (o: THREE.Object3D) => {
      if (!o.visible) return;
      if (o.userData.noEdge) { this.hidden.push(o); return; }
      const mesh = o as THREE.Mesh, m = mesh.material as THREE.ShaderMaterial | undefined;
      if (mesh.isMesh && m && !Array.isArray(m) && m.uniforms?.uInk && m.side === THREE.BackSide) {
        if (!this.opts.hulls) { o.visible = false; this.hulls.push(o); }
        return;
      }
      if (this.skipped(o)) {
        if ((o as THREE.Mesh).isMesh || (o as THREE.Sprite).isSprite || (o as THREE.Points).isPoints || (o as THREE.Line).isLine) this.hidden.push(o);
        if (mesh.isMesh && m?.uniforms?.uVeil) this.veils.push(mesh);
      }
      else this.swaps.push({ o: mesh, mat: mesh.material });
      for (const c of o.children) walk(c);
    };
    for (const c of this.scene.children) walk(c);
  }

  /** Bring hull outlines back (when edges are switched off). */
  restoreHulls() { for (const h of this.hulls) h.visible = true; this.hulls.length = 0; }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget | null, readBuffer: THREE.WebGLRenderTarget) {
    const u = this.mat.uniforms, cam = this.camera;
    u.uTan.value.set(Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * cam.aspect, Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
    u.uCamW.value.copy(cam.matrixWorld);
    u.uAO.value = this.opts.ao; u.uAOR.value = this.opts.aoRadius; u.uTaper.value = this.opts.taper; u.uStrength.value = this.opts.strength; u.uDepthK.value = this.opts.depth; u.uNormK.value = this.opts.normal; u.uFade.value.set(...this.opts.fade); u.uFol.value = this.opts.foliage; u.uEdges.value = this.lines ? 1 : 0;

    for (const s of this.swaps) {
      const m = depthSource(s.mat)!, def = (m as THREE.ShaderMaterial).defines;
      s.o.material = this.depthMat(m, !!def && ('SWAY' in def || 'FADE' in def));
    }
    for (const h of this.hidden) h.visible = false;
    const prevTarget = renderer.getRenderTarget(), prevClear = renderer.getClearColor(this.cleared), prevAlpha = renderer.getClearAlpha(), prevAuto = renderer.autoClear;
    const prevBg = this.scene.background, prevFog = this.scene.fog;
    this.scene.background = null; this.scene.fog = null;
    try {
      renderer.setRenderTarget(this.target);
      renderer.setClearColor(0x000000, 0);
      renderer.autoClear = true;
      renderer.render(this.scene, cam);
      renderer.setRenderTarget(this.veil);
      renderer.clear();
      renderer.autoClear = false;
      for (const v of this.veils) {
        const k = (v.material as THREE.ShaderMaterial).uniforms.uVeil;
        v.visible = true; k.value = 1;
        renderer.render(v, cam);
        k.value = 0;
      }
    } finally {
      renderer.autoClear = prevAuto; renderer.setClearColor(prevClear, prevAlpha); renderer.setRenderTarget(prevTarget);
      this.scene.background = prevBg; this.scene.fog = prevFog;
      for (const s of this.swaps) s.o.material = s.mat;
      for (const h of this.hidden) h.visible = true;
    }

    u.tDiffuse.value = readBuffer.texture;
    u.tData.value = this.target.texture;
    u.tVeil.value = this.veil.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  dispose() { this.target.dispose(); this.veil.dispose(); this.mat.dispose(); this.quad.dispose(); }
}
