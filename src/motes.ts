import * as THREE from 'three';
import { COMMON, G } from './toon';

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
 * Soft billowing puffs a film places itself: engine steam, chimney smoke, dust. Each puff is a camera-facing lobed blob
 * with a sunlit top, a lavender cel shadow underneath and a feathered edge instead of ink, so overlapping puffs merge
 * into one cloud, and veil the ink lines behind them. Like `Motes` they are written each frame from the time alone;
 * fade a puff in and out with `a`.
 */
export class Puffs {
  group = new THREE.Group();
  private pos: Float32Array;
  private sa: Float32Array;
  private geo = new THREE.InstancedBufferGeometry();
  private n = 0;

  /** All puffs are one instanced quad, so a chimney full of smoke is a single draw. */
  constructor(private max: number, color = 0xffffff) {
    this.pos = new Float32Array(max * 3);
    this.sa = new Float32Array(max * 3);
    const q = new THREE.PlaneGeometry(2, 2);
    this.geo.index = q.index;
    this.geo.setAttribute('position', q.getAttribute('position'));
    this.geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('iSA', new THREE.InstancedBufferAttribute(this.sa, 3).setUsage(THREE.DynamicDrawUsage));
    const mesh = new THREE.Mesh(this.geo, new THREE.ShaderMaterial({
      uniforms: { ...G, uCol: { value: new THREE.Color(color) }, uVeil: { value: 0 } },
      transparent: true, depthWrite: false,
      vertexShader: /* glsl */ `
        attribute vec3 iPos, iSA; varying vec2 vP; varying vec3 vW; varying float vA, vSeed;
        void main(){
          vP = position.xy; vA = iSA.y; vSeed = iSA.z; vW = iPos;
          vec3 r = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), u = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          gl_Position = projectionMatrix*viewMatrix*vec4(iPos + (r*position.x + u*position.y)*iSA.x*1.25, 1.);
        }`,
      fragmentShader: /* glsl */ `
        ${COMMON}
        uniform vec3 uCol; uniform float uVeil; varying vec2 vP; varying vec3 vW; varying float vA, vSeed;
        void main(){
          float an = atan(vP.y, vP.x), s = vSeed*6.283;
          float e = length(vP)/(.8 + .07*sin(an*5. + s) + .05*sin(an*9. - s*2.) + .04*(vnoise(vP*3. + s) - .5));
          if (e > 1.) discard;
          vec3 n = normalize(vec3(vP, sqrt(max(0., 1. - e*e)))), l = normalize((viewMatrix*vec4(uLightDir, 0.)).xyz);
          float nl = dot(n, l) + (vnoise(vP*2.5 - s) - .5)*.3;
          vec3 lit = uCol*(.6 + .5*uLightCol), shade = uCol*mix(uShadow, vec3(1.), .62)*(.62 + .3*uLightCol);
          vec3 col = mix(shade, lit, smoothstep(-.3, -.05, nl)) * (1. - .25*uNight) * (1. - .14*smoothstep(.7, .9, e));
          float a = vA*(1. - smoothstep(.82, 1., e));
          gl_FragColor = uVeil > .5 ? vec4(vec3(-(viewMatrix*vec4(vW, 1.)).z), a) : vec4(applyFog(col, length(cameraPosition - vW)), a);
        }`,
    }));
    mesh.frustumCulled = false;
    mesh.renderOrder = 7;
    this.group.add(mesh);
    this.group.visible = false;
  }

  begin() { this.n = 0; }

  /** Adds one puff of radius `size` metres and opacity `a`; `seed` picks its outline, so keep it fixed for a puff's life. Puffs past `max` are dropped. */
  add(x: number, y: number, z: number, size: number, a = 1, seed = 0) {
    if (this.n >= this.max || size <= 0.01 || a <= 0.003) return;
    const i = this.n++;
    this.pos.set([x, y, z], i * 3);
    this.sa.set([size, Math.min(1, a), (((seed * 0.618034) % 1) + 1) % 1], i * 3);
  }

  end() {
    this.geo.instanceCount = this.n;
    this.geo.getAttribute('iPos').needsUpdate = true;
    this.geo.getAttribute('iSA').needsUpdate = true;
    this.group.visible = this.n > 0;
  }
}
