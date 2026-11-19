import * as THREE from 'three';
import { G, COMMON } from './toon';

const N = 110;

/** Thin streamlines drifting with the wind around a point, so the air becomes visible. */
export class WindStreaks {
  mesh: THREE.InstancedMesh;
  private u = { uCenter: { value: new THREE.Vector3() }, uDir: { value: new THREE.Vector2(1, 0) }, uVis: { value: 0 } };

  constructor() {
    const g = new THREE.PlaneGeometry(1, 1);
    const off = new Float32Array(N * 4);
    let s = 7;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < N * 4; i++) off[i] = r();
    g.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
    this.mesh = new THREE.InstancedMesh(g, new THREE.ShaderMaterial({
      uniforms: { ...G, ...this.u },
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        attribute vec4 aOff; uniform float uTime; uniform vec3 uCenter; uniform vec2 uDir;
        varying float vA;
        void main(){
          vec3 box = vec3(46., 3.4, 24.);
          float spd = 4.5 + aOff.w*3.5;
          vec2 d = uDir, r = vec2(-d.y, d.x);
          float u = fract(aOff.x + uTime*spd/box.x)*box.x - box.x*.5;
          float v = (aOff.z-.5)*box.z;
          float y = .35 + aOff.y*box.y + sin(uTime*1.1 + aOff.w*25.)*.12;
          float L = 2.2 + aOff.w*4.2;
          vec3 c = uCenter + vec3(d.x*u + r.x*v, y, d.y*u + r.y*v);
          vec3 p = c + vec3(d.x,0.,d.y)*position.x*L + vec3(0.,position.y*.04,0.);
          vA = sin(3.14159*(position.x+.5))*(1.-smoothstep(.55,1.,abs(u)/(box.x*.5)));
          gl_Position = projectionMatrix*viewMatrix*vec4(p,1.);
        }`,
      fragmentShader: /* glsl */ `
        ${COMMON}
        uniform float uVis; varying float vA;
        void main(){ vec3 c = mix(vec3(.75,.88,1.), vec3(1.), 1.-uNight); gl_FragColor = vec4(c, vA*uVis*.5); }`,
    }), N);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
  }

  update(center: THREE.Vector3, windFromAngle: number, vis: number) {
    this.mesh.visible = vis > 0.002;
    this.u.uCenter.value.copy(center);
    this.u.uDir.value.set(-Math.cos(windFromAngle), -Math.sin(windFromAngle));
    this.u.uVis.value = vis;
  }
}
