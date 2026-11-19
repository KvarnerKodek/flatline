import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

const FINAL = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, uTime: { value: 0 }, uFade: { value: 0 }, uNight: { value: 1 }, uAspect: { value: 1 }, uFlash: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime,uFade,uNight,uAspect,uFlash; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
    void main(){
      vec2 c = vUv-.5;
      float r2 = dot(c*vec2(uAspect,1.), c*vec2(uAspect,1.));
      vec2 off = c*r2*.004;
      vec3 col = vec3(texture2D(tDiffuse, vUv-off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv+off).b);
      float l = dot(col, vec3(.299,.587,.114));
      col = mix(col, col*vec3(.92,1.0,1.08), uNight*.5);
      col = mix(vec3(l), col, 1.08);
      col = (col-.5)*1.06+.5;
      col *= 1.-smoothstep(.25,1.05,r2)*.55;
      col += (h(vUv*1000.+uTime)-.5)*.035;
      col += uFlash;
      col = mix(col, vec3(0.), uFade);
      gl_FragColor = vec4(clamp(col,0.,1.), 1.);
    }`,
};

export class Post {
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  final: ShaderPass;
  constructor(private r: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.Camera) {
    const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(r, rt);
    this.composer.addPass(new RenderPass(scene, cam));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(2, 2), 0.42, 0.65, 0.9);
    this.composer.addPass(this.bloom);
    this.final = new ShaderPass(FINAL);
    this.composer.addPass(this.final);
  }
  setSize(w: number, h: number, dpr: number) {
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    this.final.uniforms.uAspect.value = w / h;
  }
  render(time: number, fade: number, night: number, flash = 0) {
    this.bloom.strength = 0.16 + 0.34 * night;
    this.bloom.threshold = 1.02 - 0.12 * night;
    this.final.uniforms.uTime.value = time % 10;
    this.final.uniforms.uFade.value = fade;
    this.final.uniforms.uNight.value = night;
    this.final.uniforms.uFlash.value = flash;
    this.composer.render();
  }
}
