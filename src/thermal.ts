import * as THREE from 'three';

const HEAT = new THREE.ShaderMaterial({
  uniforms: { uHeat: { value: 0.35 } },
  vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
  fragmentShader: /* glsl */ `
    uniform float uHeat; varying vec3 vW;
    vec3 iron(float h){
      float g = pow(clamp((h-.12)/.8,0.,1.),.65)*4.;
      vec3 c = mix(vec3(.02,0.,.10), vec3(.30,0.,.42), smoothstep(0.,1.,g));
      c = mix(c, vec3(.80,.12,.28), smoothstep(1.,2.,g));
      c = mix(c, vec3(1.,.58,.06), smoothstep(2.,3.,g));
      return mix(c, vec3(1.,.96,.68), smoothstep(3.,4.,g));
    }
    void main(){
      vec3 fn = normalize(cross(dFdx(vW), dFdy(vW)));
      float h = clamp(uHeat + fn.y*.17 + fn.x*.11 + smoothstep(0.,7.,vW.y)*.2 + (fract(sin(dot(gl_FragCoord.xy, vec2(12.9,78.2)))*43758.5)-.5)*.05, 0., 1.);
      gl_FragColor = vec4(iron(h), 1.);
    }`,
});

export class Thermal {
  cam = new THREE.PerspectiveCamera(8, 1.6, 0.5, 4000);
  private clear = new THREE.Color();

  constructor(private scene: THREE.Scene) {
    this.cam.layers.set(1);
  }

  /** Include every mesh under `root` in the thermal view at the given base heat (0 to 1). */
  track(root: THREE.Object3D, heat: number) {
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || (m.material as THREE.Material).side === THREE.BackSide || (m.material as THREE.Material).transparent) return;
      this.hot(m, heat);
    });
  }

  /** Include a single mesh, for hot spots such as an engine. */
  hot(m: THREE.Mesh, heat: number) {
    m.layers.enable(1);
    m.userData.heat = heat;
    m.onBeforeRender = () => {
      HEAT.uniforms.uHeat.value = m.userData.heat;
      HEAT.uniformsNeedUpdate = true;
    };
  }

  render(r: THREE.WebGLRenderer, main: THREE.PerspectiveCamera, x: number, y: number, w: number, h: number, targetPos: THREE.Vector3, size: number) {
    const c = this.cam;
    c.position.copy(main.position);
    c.lookAt(targetPos);
    const d = main.position.distanceTo(targetPos);
    c.aspect = w / h;
    c.fov = THREE.MathUtils.radToDeg(2 * Math.atan((size / 0.42 / 2) / d)) / c.aspect;
    c.updateProjectionMatrix();
    c.updateMatrixWorld();
    const prevAuto = r.autoClear;
    const prevColor = this.clear;
    r.getClearColor(prevColor);
    const prevAlpha = r.getClearAlpha();
    const scene = this.scene;
    const prevOverride = scene.overrideMaterial;
    r.autoClear = false;
    r.setScissorTest(true);
    r.setViewport(x, y, w, h);
    r.setScissor(x, y, w, h);
    r.setClearColor(0x0a0a0a, 1);
    r.clear(true, true, false);
    scene.overrideMaterial = HEAT;
    r.render(scene, c);
    scene.overrideMaterial = prevOverride;
    r.setScissorTest(false);
    r.setClearColor(prevColor, prevAlpha);
    r.autoClear = prevAuto;
  }
}
