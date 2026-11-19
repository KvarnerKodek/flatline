import * as THREE from 'three';
import { G } from './toon';

const MAX_NODES = 8;
const PAIRS: [number, number][] = [];
for (let i = 0; i < MAX_NODES; i++) for (let j = i + 1; j < MAX_NODES; j++) PAIRS.push([i, j]);
export const LINK_RANGE = 112;

export class Swarm {
  group = new THREE.Group();
  private links: THREE.Mesh;
  private discs: THREE.Mesh[] = [];
  private column: THREE.Mesh;
  private pos = new Float32Array(PAIRS.length * 4 * 3);
  private u = new Float32Array(PAIRS.length * 4);
  private s = new Float32Array(PAIRS.length * 4);

  constructor() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aU', new THREE.BufferAttribute(this.u, 1));
    g.setAttribute('aS', new THREE.BufferAttribute(this.s, 1));
    const idx: number[] = [];
    PAIRS.forEach((_, i) => { const k = i * 4; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); });
    g.setIndex(idx);
    this.links = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: { ...G, uVis: { value: 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `attribute float aU, aS; varying float vU, vS; void main(){ vU = aU; vS = aS; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `uniform float uTime,uVis; varying float vU, vS; void main(){
        float d = step(.55, fract(vU*9. - uTime*1.4));
        float a = vS*uVis*(.2+.55*d);
        gl_FragColor = vec4(mix(vec3(.45,1.,.82), vec3(1.,.97,.7), d), a); }`,
    }));
    this.links.frustumCulled = false;
    this.links.renderOrder = 6;
    this.group.add(this.links);

    const dg = new THREE.CircleGeometry(1, 56);
    for (let i = 0; i < MAX_NODES; i++) {
      const m = new THREE.Mesh(dg, new THREE.ShaderMaterial({
        uniforms: { ...G, uVis: { value: 0 } },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
        fragmentShader: `uniform float uVis; varying vec2 vP; void main(){ float r = length(vP); float ring = smoothstep(.93,.97,r)*(1.-smoothstep(.97,1.,r)); gl_FragColor = vec4(vec3(.3,.95,.8), uVis*(.045*(1.-r)+ring*.2)); }`,
      }));
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 5;
      this.discs.push(m);
      this.group.add(m);
    }

    this.column = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.9, 90, 16, 1, true), new THREE.ShaderMaterial({
      uniforms: { ...G, uVis: { value: 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `varying float vY; void main(){ vY = position.y/90.+.5; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `uniform float uTime,uVis; varying float vY; void main(){ float pulse = step(.5, fract(vY*7. - uTime*1.8)); gl_FragColor = vec4(vec3(1.,.95,.7), uVis*(1.-vY)*(.05+.09*pulse)); }`,
    }));
    this.column.renderOrder = 6;
    this.group.add(this.column);
  }

  update(nodes: THREE.Vector3[], gateway: number, vis: number) {
    this.group.visible = vis > 0.002;
    if (!this.group.visible) return;
    (this.links.material as THREE.ShaderMaterial).uniforms.uVis.value = vis;
    const half = 0.5;
    PAIRS.forEach(([a, b], i) => {
      const k = i * 4;
      const A = nodes[a], B = nodes[b];
      const d = A && B ? A.distanceTo(B) : 1e9;
      if (!A || !B || d > LINK_RANGE) {
        for (let v = 0; v < 4; v++) { this.pos.fill(0, (k + v) * 3, (k + v) * 3 + 3); this.s[k + v] = 0; }
        return;
      }
      const flip = A.distanceTo(nodes[gateway]) < B.distanceTo(nodes[gateway]);
      const P = flip ? B : A, Q = flip ? A : B;
      const dx = Q.x - P.x, dz = Q.z - P.z, l = Math.hypot(dx, dz) || 1;
      const nx = (-dz / l) * half, nz = (dx / l) * half;
      const y = 1.7;
      const set = (v: number, x: number, z: number, uu: number) => { this.pos.set([x, y, z], (k + v) * 3); this.u[k + v] = uu * l / 12; this.s[k + v] = 1 - d / LINK_RANGE * 0.6; };
      set(0, P.x + nx, P.z + nz, 0); set(1, P.x - nx, P.z - nz, 0); set(2, Q.x + nx, Q.z + nz, 1); set(3, Q.x - nx, Q.z - nz, 1);
    });
    (this.links.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.links.geometry.getAttribute('aU') as THREE.BufferAttribute).needsUpdate = true;
    (this.links.geometry.getAttribute('aS') as THREE.BufferAttribute).needsUpdate = true;
    this.discs.forEach((m, i) => {
      const n = nodes[i];
      m.visible = !!n;
      if (!n) return;
      m.position.set(n.x, 0.9, n.z);
      m.scale.setScalar(44);
      (m.material as THREE.ShaderMaterial).uniforms.uVis.value = vis;
    });
    const g = nodes[gateway];
    this.column.position.set(g.x, 46, g.z);
    (this.column.material as THREE.ShaderMaterial).uniforms.uVis.value = vis;
  }
}
