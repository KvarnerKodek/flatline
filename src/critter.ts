import * as THREE from 'three';
import { taperedLimb } from './rig';
import { glow, inked, outline, toon } from './toon';

const TAU = Math.PI * 2;
export const EXPRESSIONS = ['open', 'happy', 'sleep', 'focus', 'oops', 'love', 'think'] as const;
export type Expression = (typeof EXPRESSIONS)[number];

export interface CritterColors { body?: number; accent?: number; metal?: number; screen?: [top: string, bottom: string]; glow?: string; cheek?: string }

/** One 256-pixel cell per expression, side by side, drawn as glowing strokes on a dark screen. */
export function faceAtlas(c: CritterColors = {}): HTMLCanvasElement {
  const cell = 256, canvas = document.createElement('canvas'), g = canvas.getContext('2d')!, [top, bottom] = c.screen ?? ['#16224a', '#0a1230'], ink = c.glow ?? '#b9fbff', cheek = c.cheek ?? '#ff9d8a';
  canvas.width = cell * EXPRESSIONS.length; canvas.height = cell;
  EXPRESSIONS.forEach((name, i) => {
    const x = i * cell, L = x + 82, R = x + 174, y = 112, eyes = (draw: (ex: number) => void) => [L, R].forEach(draw);
    const bg = g.createLinearGradient(0, 0, 0, cell);
    bg.addColorStop(0, top); bg.addColorStop(1, bottom);
    g.fillStyle = bg; g.fillRect(x, 0, cell, cell);
    g.shadowColor = ink; g.shadowBlur = 22; g.strokeStyle = g.fillStyle = ink; g.lineCap = 'round'; g.lineWidth = 16;
    if (name === 'open') {
      eyes((ex) => { g.beginPath(); g.ellipse(ex, y, 17, 27, 0, 0, TAU); g.fill(); });
      g.shadowBlur = 0; g.fillStyle = '#ffffff';
      eyes((ex) => { g.beginPath(); g.arc(ex + 5, y - 9, 6, 0, TAU); g.fill(); });
    }
    if (name === 'happy') { eyes((ex) => { g.beginPath(); g.arc(ex, y + 12, 22, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }); g.beginPath(); g.arc(x + 128, 170, 20, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); }
    if (name === 'sleep') eyes((ex) => { g.beginPath(); g.moveTo(ex - 22, y); g.quadraticCurveTo(ex, y + 16, ex + 22, y); g.stroke(); });
    if (name === 'focus') { g.beginPath(); g.moveTo(L - 22, y - 22); g.lineTo(L + 14, y); g.lineTo(L - 22, y + 22); g.moveTo(R + 22, y - 22); g.lineTo(R - 14, y); g.lineTo(R + 22, y + 22); g.stroke(); }
    if (name === 'oops') {
      eyes((ex) => { g.beginPath(); g.arc(ex, y, 28, 0, TAU); g.lineWidth = 8; g.stroke(); g.beginPath(); g.arc(ex, y, 6, 0, TAU); g.fill(); });
      g.lineWidth = 10; g.beginPath(); g.moveTo(x + 104, 184); g.quadraticCurveTo(x + 128, 168, x + 152, 184); g.stroke();
    }
    if (!['focus', 'oops', 'love'].includes(name)) {
      g.save(); g.shadowBlur = 10; g.shadowColor = cheek; g.fillStyle = cheek + '8c';
      for (const bx of [L - 22, R + 22]) { g.beginPath(); g.ellipse(bx, y + 40, 15, 8, 0, 0, TAU); g.fill(); }
      g.restore();
    }
    if (name === 'love') { g.fillStyle = cheek; g.shadowColor = cheek; eyes((ex) => { g.beginPath(); g.moveTo(ex, y + 26); g.bezierCurveTo(ex - 40, y - 4, ex - 18, y - 36, ex, y - 12); g.bezierCurveTo(ex + 18, y - 36, ex + 40, y - 4, ex, y + 26); g.fill(); }); }
    if (name === 'think') { g.beginPath(); g.ellipse(L, y, 15, 24, 0, 0, TAU); g.fill(); g.beginPath(); g.moveTo(R - 22, y - 26); g.lineTo(R + 22, y - 34); g.stroke(); g.beginPath(); g.ellipse(R, y + 4, 15, 24, 0, 0, TAU); g.fill(); }
  });
  return canvas;
}

/** True during a blink: brief, every few seconds, out of step between critters with different seeds. */
export const blinking = (t: number, seed: number) => Math.sin(t * 0.9 + seed * 3) > 0.985;

/**
 * Secondary motion: a two-segment tail that whips with the second segment trailing the first, and an antenna that lags the body.
 * `energy` 0 to about 1.5 is how hard the critter is moving, `roll` its bank. Angles in radians. Pure in `t`.
 */
export function secondary(t: number, seed: number, energy: number, roll = 0) {
  const ph = t * 5 + seed, fl = 0.25 + 0.5 * energy;
  return {
    tail: { x: 0.15, z: 0.5 + Math.sin(ph) * 0.3 * fl + roll },
    tail2: Math.sin(ph - 1.1) * 0.5 * fl,
    antenna: { x: Math.sin(ph * 0.7 - 0.5) * 0.12 * fl, z: -roll * 0.9 + Math.sin(ph * 0.6) * 0.14 * fl },
  };
}

export interface CritterPose { p: THREE.Vector3; t: number; yaw?: number; expr?: Expression; arms?: number; lean?: number; hover?: number; bob?: number; roll?: number; look?: number; squash?: number }

/**
 * A small round helper with a screen face: seven expressions, blinking, a bobbing hover with a glowing thruster, swinging arms,
 * a two-segment tail and a lagging antenna. Every part of the pose is a pure function of its inputs.
 */
export class Critter {
  root = new THREE.Group();
  rig = new THREE.Group();
  head = new THREE.Group();
  readonly seed: number;
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private elbowL = new THREE.Group();
  private elbowR = new THREE.Group();
  private tail: THREE.Object3D;
  private tail2: THREE.Object3D;
  private antenna: THREE.Object3D;
  private jet: THREE.Sprite;
  private tip: THREE.Sprite;
  private texture: THREE.CanvasTexture;
  private expr?: Expression;

  constructor(public name: string, accent: number, public scale = 1, colors: CritterColors = {}) {
    this.seed = [...name].reduce((a, ch) => a + ch.charCodeAt(0), 0) * 0.37;
    const ink = outline(2), mat = (c: number, spec = 0.18) => toon({ color: c, spec }), shell = mat(colors.body ?? 0xf3f5fb, 0.25), acc = mat(accent, 0.3), metal = mat(colors.metal ?? 0x59607a);
    const part = (g: THREE.BufferGeometry, m: THREE.ShaderMaterial) => inked(g, m, 2, ink);
    const torso = part(new THREE.SphereGeometry(0.34, 20, 14).scale(1, 1.08, 0.95), shell);
    const belly = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.06, 8, 24).rotateX(Math.PI / 2).translate(0, 0.16, 0), acc);
    const pack = part(new THREE.BoxGeometry(0.34, 0.4, 0.16).translate(0, 0.02, -0.34), acc);
    const scarf = part(new THREE.TorusGeometry(0.25, 0.055, 8, 24).rotateX(Math.PI / 2).translate(0, 0.36, 0), acc);
    this.head.add(part(new THREE.SphereGeometry(0.31, 22, 16).scale(1.12, 0.92, 1), shell));
    this.head.position.y = 0.64;
    for (const s of [-1, 1]) this.head.add(part(new THREE.CylinderGeometry(0.1, 0.1, 0.07, 14).rotateZ(Math.PI / 2).translate(s * 0.36, 0, 0), acc));
    this.tail = part(new THREE.CapsuleGeometry(0.045, 0.2, 4, 8).translate(0, -0.12, 0), acc);
    this.tail.position.set(0.2, 0.36, 0.12);
    this.tail2 = part(new THREE.CapsuleGeometry(0.04, 0.16, 4, 8).translate(0, -0.1, 0), acc);
    this.tail2.position.y = -0.2;
    this.tail.add(this.tail2);
    this.antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.22, 6).translate(0, 0.11, 0), metal);
    this.antenna.position.y = 0.28;
    this.tip = glow(accent, 0.34, 1);
    this.tip.position.y = 0.25;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), acc);
    bulb.position.y = 0.24;
    this.antenna.add(bulb, this.tip);
    this.head.add(this.antenna);
    this.texture = new THREE.CanvasTexture(faceAtlas(colors));
    this.texture.colorSpace = THREE.NoColorSpace;
    this.texture.repeat.set(1 / EXPRESSIONS.length, 1);
    const w = 1.5, h = 0.95;
    this.head.add(new THREE.Mesh(new THREE.SphereGeometry(0.318, 28, 16, Math.PI / 2 - w / 2, w, Math.PI / 2 - h / 2, h).scale(1.12, 0.92, 1), new THREE.MeshBasicMaterial({ map: this.texture, fog: false })));
    for (const [arm, elbow, s] of [[this.armL, this.elbowL, -1], [this.armR, this.elbowR, 1]] as const) {
      elbow.position.y = -0.17;
      arm.add(part(new THREE.SphereGeometry(0.062, 10, 8), shell), part(taperedLimb(0.062, 0.05, 0.17 - 0.05, 0.06), shell), elbow);
      elbow.add(part(new THREE.SphereGeometry(0.05, 10, 8), shell), part(taperedLimb(0.05, 0.04, 0.1), shell));
      const hand = new THREE.Group();
      hand.position.y = -0.17;
      hand.add(part(new THREE.SphereGeometry(0.075, 12, 10).scale(1, 1.05, 0.9), acc), part(new THREE.SphereGeometry(0.03, 8, 6).translate(s * -0.05, 0.0, 0.045), acc));
      elbow.add(hand);
      arm.position.set(s * 0.36, 0.16, 0.02);
    }
    const nozzle = part(new THREE.CylinderGeometry(0.16, 0.08, 0.14, 12).translate(0, -0.4, 0), metal);
    this.jet = glow(accent, 0.9, 0.9);
    this.jet.position.y = -0.6;
    this.rig.add(torso, belly, pack, scarf, this.tail, this.head, this.armL, this.armR, nozzle, this.jet);
    this.root.add(this.rig);
    this.root.scale.setScalar(scale);
    this.setExpression('open');
  }

  setExpression(e: Expression) {
    if (e === this.expr) return;
    this.expr = e;
    this.texture.offset.set(EXPRESSIONS.indexOf(e) / EXPRESSIONS.length, 0);
  }

  pose(o: CritterPose) {
    const { p, t, seed } = { ...o, seed: this.seed }, hover = o.hover ?? 1, roll = o.roll ?? 0, lean = o.lean ?? 0, expr = o.expr ?? 'open', arms = o.arms ?? 0.15;
    this.root.position.set(p.x, p.y + Math.sin(t * 2.3 + seed) * (o.bob ?? 0.06) * this.scale, p.z);
    this.root.rotation.set(0, o.yaw ?? 0, 0);
    this.rig.rotation.set(lean, 0, roll + Math.sin(t * 1.7 + seed) * 0.04);
    this.setExpression(expr === 'open' && blinking(t, seed) ? 'sleep' : expr);
    const sway = Math.sin(t * 3.1 + seed) * 0.12;
    this.armL.rotation.set(0, 0, -0.35 - arms * 1.9 + sway);
    this.armR.rotation.set(0, 0, 0.35 + arms * 1.9 - sway);
    const bend = 0.25 + 0.35 * Math.min(1, arms), trail = Math.sin(t * 3.1 + seed - 0.8) * 0.12 - sway;
    this.elbowL.rotation.set(0, 0, bend - trail * 0.9);
    this.elbowR.rotation.set(0, 0, -(bend + trail * 0.9));
    this.head.rotation.set(0, o.look ?? 0, Math.sin(t * 1.3 + seed) * 0.03);
    this.jet.scale.setScalar(0.9 * (0.85 + 0.15 * Math.sin(t * 30 + seed) * hover) * (0.4 + 0.6 * hover));
    (this.jet.material as THREE.SpriteMaterial).opacity = 0.9 * hover;
    this.tip.scale.setScalar(0.34 * (1 + 0.25 * Math.sin(t * 4 + seed)));
    const s = secondary(t, seed, hover + Math.abs(lean) * 4, roll);
    this.tail.rotation.set(s.tail.x, 0, s.tail.z);
    this.tail2.rotation.z = s.tail2;
    this.antenna.rotation.set(s.antenna.x, 0, s.antenna.z);
    const q = o.squash ?? 0;
    this.root.scale.set(this.scale * (1 + q), this.scale * (1 - q), this.scale * (1 + q));
  }
}
