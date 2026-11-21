import * as THREE from 'three';
import { G, COMMON, hex } from './toon';
import type { Mood } from './mood';

const U = {
  uZenith: { value: new THREE.Vector3() }, uMid: { value: new THREE.Vector3() }, uHorizon: { value: new THREE.Vector3() },
  uStars: { value: 1 }, uMoon: { value: 1 }, uSun: { value: 0 }, uMoonDir: { value: new THREE.Vector3() },
  uCloud: { value: new THREE.Vector3() }, uCloudShade: { value: new THREE.Vector3() }, uCover: { value: 0.5 },
  uRidge: { value: new THREE.Vector3() }, uLand: { value: new THREE.Vector3() },
};

export function makeSky(): THREE.Group {
  const root = new THREE.Group();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(9000, 48, 32),
    new THREE.ShaderMaterial({
      uniforms: { ...G, ...U },
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: `varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.); }`,
      fragmentShader: /* glsl */ `
        ${COMMON}
        varying vec3 vD;
        uniform vec3 uZenith,uMid,uHorizon,uMoonDir,uCloud,uCloudShade;
        uniform float uStars,uMoon,uSun,uCover;
        void main(){
          vec3 d = normalize(vD);
          float e = clamp(d.y, 0., 1.);
          vec3 col = mix(uHorizon, uMid, smoothstep(0.,.18,e));
          col = mix(col, uZenith, smoothstep(.14,.8,e));
          float glowH = pow(max(1.-e,0.), 6.);
          vec3 ld = normalize(uMoonDir);
          float toL = max(dot(d, ld), 0.);
          col += uHorizon*.35*glowH*(.3+.7*pow(toL,3.));
          // stars
          if (uStars > 0.01 && d.y > 0.) {
            vec3 sp = d*220.;
            vec3 id = floor(sp); vec3 f = fract(sp)-.5;
            float h = hash21(id.xy+id.z*7.3);
            float st = step(.9965,h) * smoothstep(.34,.0,length(f));
            float tw = .6+.4*sin(uTime*(1.5+h*3.)+h*40.);
            col += vec3(.85,.92,1.)*st*tw*uStars*smoothstep(.02,.25,d.y);
            vec3 sp2 = d*90.; vec3 id2 = floor(sp2); vec3 f2 = fract(sp2)-.5;
            float h2 = hash21(id2.xy*1.7+id2.z*3.1);
            float r2 = length(f2);
            float big = step(.972,h2) * (smoothstep(.3,.0,r2) + .35*smoothstep(.5,.0,r2));
            vec3 tint = mix(vec3(.75,.85,1.), vec3(1.,.9,.75), fract(h2*91.));
            col += tint*big*(.65+.35*sin(uTime*(1.+h2*2.)+h2*60.))*uStars*smoothstep(.03,.3,d.y);
            float mwd = dot(d, normalize(vec3(.35,.75,-.55))); float mw = exp(-mwd*mwd*14.) * smoothstep(.28,.62,fbm(d.xz*14./(d.y+.4)+5.));
            col += vec3(.18,.24,.42)*mw*.5*uStars*smoothstep(.05,.4,d.y);
          }
          // moon
          float md = acos(clamp(dot(d, ld),-1.,1.));
          float disc = 1.-smoothstep(.034,.037,md);
          vec3 moonCol = vec3(.93,.96,1.);
          float crater = smoothstep(.55,.6,fbm(d.xz*40.+3.));
          moonCol *= .93+.07*crater;
          float halo = exp(-md*14.)*.5 + exp(-md*40.)*.5;
          col += vec3(.45,.6,.9)*halo*uMoon*.55;
          col = mix(col, moonCol, disc*uMoon);
          // sun
          float sd = 1.-smoothstep(.045,.048,md);
          col += vec3(1.,.85,.6)*exp(-md*7.)*uSun*.42*step(0.,d.y+.05);
          col = mix(col, vec3(1.,.95,.8), sd*uSun);
          // painted clouds: streaky bands with a lit rim toward the light
          if (d.y > .0) {
            vec2 p = d.xz/(d.y+.3);
            p = p*vec2(.5,.55) + vec2(uTime*.003, 0.);
            vec2 w = vec2(fbm(p*1.7+3.), fbm(p*1.7));
            float n = fbm(p + .55*w);
            vec2 lo = normalize(ld.xz+1e-3)*.045;
            float n2 = fbm(p + lo + .55*w);
            float cov = smoothstep(.02,.22,d.y)*(1.-smoothstep(.55,.95,d.y));
            float body = smoothstep(uCover+.05, uCover+.1, n);
            float inner = smoothstep(uCover+.05, uCover+.1, n2);
            float rim = body*(1.-inner);
            vec3 base = mix(col, uCloudShade, .78);
            vec3 cc = mix(base, uCloud, rim);
            col = mix(col, cc, body*cov*.92);
          }
          gl_FragColor = vec4(col, 1.);
        }`,
    }),
  );
  sky.renderOrder = -10; sky.userData.noEdge = true;
  sky.frustumCulled = false;
  root.add(sky);

  const ridges: { m: THREE.Mesh; haze: number }[] = [];
  const layers = [
    { r: 7600, h: 520, seed: 1.7, haze: 0.62, y: -30 },
    { r: 6200, h: 420, seed: 5.2, haze: 0.46, y: -30 },
    { r: 4800, h: 300, seed: 9.9, haze: 0.3, y: -20 },
  ];
  for (const L of layers) {
    const segs = 360;
    const pos: number[] = [], idx: number[] = [];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const n = Math.sin(a * 3 + L.seed) * 0.5 + Math.sin(a * 7.3 + L.seed * 2) * 0.28 + Math.sin(a * 17 + L.seed * 3) * 0.12 + Math.sin(a * 41 + L.seed) * 0.05;
      const mask = 0.45 + 0.4 * (Math.sin(a * 2.0 + L.seed * 0.7) * 0.5 + 0.5);
      const h = Math.max(0.05, (n * 0.35 + 0.4) * mask) * L.h * 0.55;
      const x = Math.cos(a) * L.r, z = Math.sin(a) * L.r;
      pos.push(x, L.y - 40, z, x, L.y + h, z);
      if (i < segs) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    const mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: { ...G, ...U, uHaze: { value: L.haze } },
      side: THREE.DoubleSide,
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.); }`,
      fragmentShader: /* glsl */ `
        ${COMMON}
        uniform vec3 uRidge, uHorizon, uZenith, uLand; uniform float uHaze;
        varying vec3 vP;
        void main(){
          float t = clamp(vP.y/350.,0.,1.);
          vec3 c = mix(uRidge*.85, uRidge*1.12, t);
          vec3 h = mix(uHorizon, uFog, .5);
          c = mix(c, h, uHaze);
          c = mix(c, h, smoothstep(.0,.0,t)*.0 + (1.-t)*.45);
          gl_FragColor = vec4(c,1.);
        }`,
    }));
    mesh.frustumCulled = false;
    mesh.renderOrder = -9; mesh.userData.noEdge = true;
    ridges.push({ m: mesh, haze: L.haze });
    root.add(mesh);
  }
  return root;
}

export function updateSky(m: Mood, cover: number) {
  U.uZenith.value.copy(m.zenith); U.uMid.value.copy(m.mid); U.uHorizon.value.copy(m.horizon);
  U.uStars.value = m.stars; U.uMoon.value = m.moon; U.uSun.value = m.sun;
  U.uMoonDir.value.copy(m.lightDir);
  U.uCloud.value.copy(m.cloud); U.uCloudShade.value.copy(m.cloudShade); U.uCover.value = cover;
  U.uRidge.value.copy(m.ridge); U.uLand.value.copy(m.land);
}
