import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { EdgePass, setHaze, type EdgeOpts, type HazeOpts } from './edges';

/** Final look. Every field is optional and the defaults reproduce flatline's original grade. */
export interface Grade { saturation?: number; contrast?: number; vignette?: number; grain?: number; bloom?: number; chroma?: number; tint?: [number, number, number]; lift?: number; /** 0 to 1: a soft watercolour blur that takes the CG edge off */ soften?: number; /** 0 to 1: screen-locked paper fibre and canvas tooth */ paper?: number; /** 0 to 1: hand-painted wobble of every edge, about 1 px at 1 */ bleed?: number; /** 0 to 1: cool shadows and warm highlights */ split?: number }
const DEFAULT_GRADE: Required<Grade> = { saturation: 1.08, contrast: 1.06, vignette: 0.55, grain: 0.035, bloom: 1, chroma: 0.004, tint: [1, 1, 1], lift: 0, soften: 0, paper: 0, bleed: 0, split: 0 };

/** Highlight roll-off: identity below `knee`, then an exponential shoulder that tends to 1 and stays smooth and monotonic, so bright washes keep their hue instead of clipping. Mirrors `shoulder` in the final shader. */
export const shoulder = (x: number, knee = 0.88) => x <= knee ? x : knee + (1 - knee) * (1 - Math.exp(-(x - knee) / (1 - knee)));

const FINAL = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, uTime: { value: 0 }, uFade: { value: 0 }, uNight: { value: 1 }, uAspect: { value: 1 }, uFlash: { value: 0 },
    uSat: { value: 1.08 }, uCon: { value: 1.06 }, uVig: { value: 0.55 }, uGrain: { value: 0.035 }, uChroma: { value: 0.004 }, uTint: { value: new THREE.Vector3(1, 1, 1) }, uLift: { value: 0 }, uSoften: { value: 0 }, uPaper: { value: 0 }, uBleed: { value: 0 }, uSplit: { value: 0 }, uTexel: { value: new THREE.Vector2(1 / 1280, 1 / 720) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime,uFade,uNight,uAspect,uFlash,uSat,uCon,uVig,uGrain,uChroma,uLift,uSoften,uPaper,uBleed,uSplit; uniform vec2 uTexel; uniform vec3 uTint; varying vec2 vUv;
    vec3 shoulder(vec3 x){ const float k = .88; return mix(x, k + (1.-k)*(1.-exp(-(x-k)/(1.-k))), step(k, x)); }
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
    float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
    void main(){
      vec2 px = vUv*vec2(uAspect,1.)*540.;
      vec2 uv = vUv + (vec2(vn(px*.11), vn(px*.11+37.))-.5)*uTexel*3.*uBleed;
      vec2 c = vUv-.5;
      float r2 = dot(c*vec2(uAspect,1.), c*vec2(uAspect,1.));
      vec2 off = c*r2*uChroma;
      vec3 col = vec3(texture2D(tDiffuse, uv-off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv+off).b);
      if (uSoften > 0.) { vec3 b = texture2D(tDiffuse, vUv+vec2(uTexel.x,0.)).rgb + texture2D(tDiffuse, vUv-vec2(uTexel.x,0.)).rgb + texture2D(tDiffuse, vUv+vec2(0.,uTexel.y)).rgb + texture2D(tDiffuse, vUv-vec2(0.,uTexel.y)).rgb + texture2D(tDiffuse, vUv+uTexel).rgb + texture2D(tDiffuse, vUv-uTexel).rgb + texture2D(tDiffuse, vUv+vec2(uTexel.x,-uTexel.y)).rgb + texture2D(tDiffuse, vUv+vec2(-uTexel.x,uTexel.y)).rgb; col = mix(col, (col*2.+b)/10., uSoften); }
      float l = dot(col, vec3(.299,.587,.114));
      col = mix(col, col*vec3(.92,1.0,1.08), uNight*.5);
      col = mix(vec3(l), col, uSat);
      col = (col-.5)*uCon+.5;
      col = col*uTint + uLift*(1.-col);
      col *= 1.-smoothstep(.25,1.05,r2)*uVig;
      float lu = dot(col, vec3(.299,.587,.114));
      col += vec3(uSplit*((1.-smoothstep(0.,.5,lu))*vec3(-.012,0.,.03) + smoothstep(.55,1.,lu)*vec3(.03,.012,-.02)));
      col += (h(vUv*1000.+uTime)-.5)*uGrain*(1.-.7*abs(2.*lu-1.));
      col = shoulder(max(col, 0.));
      col += uFlash;
      float pp = (vn(px*.9)-.5)*.6 + (vn(px*2.7+9.)-.5)*.3;
      col *= 1. + uPaper*.14*pp;
      col = mix(col, vec3(0.), uFade);
      gl_FragColor = vec4(clamp(col,0.,1.), 1.);
    }`,
};

export class Post {
  composer: EffectComposer;
  /** screen-space ink and haze pass; present when the look has `edges` */
  edges?: EdgePass;
  private fxaa?: ShaderPass;
  bloom: UnrealBloomPass;
  final: ShaderPass;
  private grade: Required<Grade>;
  constructor(private r: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.Camera, grade: Grade = {}, fx: { edges?: EdgeOpts; haze?: HazeOpts } = {}) {
    this.grade = { ...DEFAULT_GRADE, ...grade };
    const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(r, rt);
    this.composer.addPass(new RenderPass(scene, cam));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(2, 2), 0.42, fx.edges ? 0.35 : 0.65, 0.9);
    this.bloom.materialHighPassFilter.fragmentShader = this.bloom.materialHighPassFilter.fragmentShader.replace('texture2D( tDiffuse, vUv )', 'min(texture2D( tDiffuse, vUv ), 64.)');
    if (fx.edges && cam instanceof THREE.PerspectiveCamera) {
      this.edges = new EdgePass(scene, cam, fx.edges);
      this.composer.insertPass(this.edges, 1);
      setHaze(fx.haze);
    }
    (this.bloom as unknown as { materialHighPassFilter: THREE.ShaderMaterial }).materialHighPassFilter.uniforms.smoothWidth.value = 0.4;
    this.composer.addPass(this.bloom);
    if (this.edges) { this.fxaa = new ShaderPass(FXAAShader); this.composer.addPass(this.fxaa); }
    this.final = new ShaderPass(FINAL);
    const g = this.grade, u = this.final.uniforms;
    u.uSat.value = g.saturation; u.uCon.value = g.contrast; u.uVig.value = g.vignette; u.uGrain.value = g.grain; u.uChroma.value = g.chroma; u.uTint.value.set(...g.tint); u.uLift.value = g.lift; u.uSoften.value = g.soften; u.uPaper.value = g.paper; u.uBleed.value = g.bleed; u.uSplit.value = g.split;
    this.composer.addPass(this.final);
  }
  setSize(w: number, h: number, dpr: number) {
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.final.uniforms.uAspect.value = w / h;
    this.edges?.setSize(w * dpr, h * dpr);
    this.fxaa?.uniforms.resolution.value.set(1 / (w * dpr), 1 / (h * dpr));
    this.final.uniforms.uTexel.value.set(1 / (w * dpr), 1 / (h * dpr));
  }
  render(time: number, fade: number, night: number, flash = 0) {
    this.bloom.strength = (0.16 + 0.34 * night) * this.grade.bloom;
    this.bloom.threshold = 0.8 - 0.1 * night;
    this.final.uniforms.uTime.value = time % 10;
    this.final.uniforms.uFade.value = fade;
    this.final.uniforms.uNight.value = night;
    this.final.uniforms.uFlash.value = flash;
    this.edges?.scan();
    this.composer.render();
  }
}
