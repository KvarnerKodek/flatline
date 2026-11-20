import * as THREE from 'three';
import { G, toon } from './toon';
import { outlineI } from './instanced';

/**
 * A cloud of glowing points a film places itself: fireflies, sparks, coins, lanterns, snow. The film writes
 * every point each frame from the time alone, which keeps them seekable.
 */
export class Motes {
  points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private n = 0;

  /**
   * `disc` 0 draws soft additive glows, 1 draws solid coins with a rim and a halo, which also read in daylight.
   * `minPx` and `maxPx` bound a point's size on a 1080-line screen, so points stay legible far off and modest up close.
   */
  constructor(public max: number, disc = 0, minPx = 1.5, maxPx = 72) {
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 4));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: { uRes: G.uRes, uDisc: { value: disc }, uMinPx: { value: minPx }, uMaxPx: { value: maxPx } },
      transparent: true, depthWrite: false, premultipliedAlpha: true,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      vertexShader: /* glsl */ `
        attribute vec4 aCol; attribute float aSize; uniform vec2 uRes; uniform float uMinPx, uMaxPx; varying vec4 vC;
        void main(){
          vC = aCol;
          vec4 mv = viewMatrix*modelMatrix*vec4(position,1.);
          gl_Position = projectionMatrix*mv;
          float px = aSize*projectionMatrix[1][1]*uRes.y*.5/max(-mv.z,.01);
          float k = uRes.y/1080.;
          gl_PointSize = clamp(px, uMinPx*k, uMaxPx*k);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uDisc; varying vec4 vC;
        void main(){
          float d = length(gl_PointCoord-.5)*2.;
          float edge = 1.-smoothstep(.9,1.,d);
          float soft = exp(-d*d*5.)*1.15 + exp(-d*d*1.6)*.18;
          float face = 1.-smoothstep(.5,.55,d);
          float ring = smoothstep(.3,.34,d)-smoothstep(.37,.41,d);
          vec3 coin = vC.rgb*(.9 - .32*smoothstep(.44,.5,d) - .3*ring) + vec3(.16)*smoothstep(.2,.0,length(gl_PointCoord-vec2(.4,.38))*2.);
          float halo = exp(-d*d*2.6)*.42*edge;
          vec3 rgb = mix(vC.rgb*soft*edge, coin*face + vC.rgb*halo*(1.-face), uDisc);
          gl_FragColor = vec4(rgb*vC.a, face*vC.a*uDisc);
        }`,
    }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
  }

  begin() { this.n = 0; }

  /** Adds one point: `size` is its diameter in metres, `a` its brightness. Points past `max` are dropped. */
  add(x: number, y: number, z: number, size: number, c: THREE.Vector3, a = 1) {
    if (this.n >= this.max || a <= 0.003) return;
    const i = this.n++;
    this.pos.set([x, y, z], i * 3);
    this.col.set([c.x, c.y, c.z, a], i * 4);
    this.size[i] = size;
  }

  end() {
    const g = this.points.geometry;
    g.setDrawRange(0, this.n);
    for (const k of ['position', 'aCol', 'aSize']) g.getAttribute(k).needsUpdate = true;
    this.points.visible = this.n > 0;
  }
}

/** Rain streaks falling around the camera, slanted by the wind. */
export class Rain {
  mesh: THREE.InstancedMesh;
  private u = { uCenter: { value: new THREE.Vector3() }, uVis: { value: 0 }, uSlant: { value: new THREE.Vector2(0.25, 0.1) } };

  constructor(count = 900, seed = 13) {
    const g = new THREE.PlaneGeometry(1, 1);
    const off = new Float32Array(count * 4);
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < count * 4; i++) off[i] = r();
    g.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
    this.mesh = new THREE.InstancedMesh(g, new THREE.ShaderMaterial({
      uniforms: { ...G, ...this.u },
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        attribute vec4 aOff; uniform float uTime; uniform vec3 uCenter; uniform vec2 uSlant; varying float vA;
        void main(){
          vec3 box = vec3(60., 34., 60.);
          float spd = 26. + aOff.w*16.;
          float y = (1.-fract(aOff.y + uTime*spd/box.y))*box.y;
          vec3 c = vec3((aOff.x-.5)*box.x, y - 8., (aOff.z-.5)*box.z);
          c.xz += uSlant*(y-box.y);
          c += floor(uCenter/4.)*4.;
          vec3 fall = normalize(vec3(uSlant.x, -1., uSlant.y));
          vec3 side = normalize(cross(fall, cameraPosition-c));
          vec3 p = c + fall*position.y*(1.1+aOff.w*1.3) + side*position.x*.028;
          vA = .5+.5*aOff.w;
          gl_Position = projectionMatrix*viewMatrix*vec4(p,1.);
        }`,
      fragmentShader: `uniform float uVis; varying float vA; void main(){ gl_FragColor = vec4(.78,.86,1., vA*uVis*.42); }`,
    }), count);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9;
  }

  update(center: THREE.Vector3, vis: number, slantX = 0.25, slantZ = 0.1) {
    this.mesh.visible = vis > 0.002;
    this.u.uCenter.value.copy(center);
    this.u.uVis.value = vis;
    this.u.uSlant.value.set(slantX, slantZ);
  }
}

/** A glowing arc between two points, drawn from `tail` to `head` (both 0 to 1), for routes and links. */
export class Arc {
  mesh: THREE.Mesh;
  curve: THREE.QuadraticBezierCurve3;
  private u = { uHead: { value: 0 }, uTail: { value: 0 }, uVis: { value: 1 }, uCol: { value: new THREE.Vector3(1, 0.8, 0.4) } };

  constructor(from: THREE.Vector3, to: THREE.Vector3, lift: number, width = 1.2, color?: THREE.Vector3) {
    const mid = from.clone().add(to).multiplyScalar(0.5);
    mid.y += lift;
    this.curve = new THREE.QuadraticBezierCurve3(from, mid, to);
    if (color) this.u.uCol.value.copy(color);
    this.mesh = new THREE.Mesh(new THREE.TubeGeometry(this.curve, 96, width, 6, false), new THREE.ShaderMaterial({
      uniforms: { uTime: G.uTime, ...this.u },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `varying float vU; void main(){ vU = uv.x; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `uniform float uHead,uTail,uVis,uTime; uniform vec3 uCol; varying float vU; void main(){
        float on = step(uTail, vU)*step(vU, uHead);
        float tip = exp(-(uHead-vU)*30.);
        float flow = .55+.45*step(.5, fract(vU*26.-uTime*.9));
        gl_FragColor = vec4(uCol*(flow*.55+tip*1.5)*on*uVis, 1.); }`,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
  }

  update(head: number, tail = 0, vis = 1) {
    this.u.uHead.value = head; this.u.uTail.value = tail; this.u.uVis.value = vis;
    this.mesh.visible = vis > 0.002 && head > tail;
  }
}

/**
 * Soft inked blobs a film places itself: chimney smoke, engine steam, dust. Like `Motes` they are written each
 * frame from the time alone, but they are lit and outlined, so they read against a bright sky.
 */
export class Puffs {
  group = new THREE.Group();
  private body: THREE.InstancedMesh;
  private ink: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private n = 0;

  /** All puffs are one instanced mesh, so a chimney full of smoke is a single draw. */
  constructor(private max: number, color = 0xffffff, ink = 1.4) {
    const g = new THREE.IcosahedronGeometry(1, 2);
    this.body = new THREE.InstancedMesh(g, toon({ color, spec: 0, emissive: color, emisAmt: 0.22 }), max);
    this.ink = new THREE.InstancedMesh(g, outlineI(ink), max);
    for (const m of [this.body, this.ink]) { m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); }
    this.group.add(this.body, this.ink);
    this.group.visible = false;
  }

  begin() { this.n = 0; }

  add(x: number, y: number, z: number, size: number) {
    if (this.n >= this.max || size <= 0.01) return;
    this.m.compose(this.p.set(x, y, z), this.q, this.s.set(size, size * 0.82, size));
    this.body.setMatrixAt(this.n, this.m);
    this.ink.setMatrixAt(this.n++, this.m);
  }

  end() {
    for (const m of [this.body, this.ink]) { m.count = this.n; m.instanceMatrix.needsUpdate = true; }
    this.group.visible = this.n > 0;
  }
}
