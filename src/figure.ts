import * as THREE from 'three';
import { G, toon, outline } from './toon';
import { sealRig } from './rig';

const INK = outline(1.7);
const mats = new Map<number, THREE.ShaderMaterial>();
const mat = (c: number) => mats.get(c) ?? (mats.set(c, toon({ color: c, spec: 0 })), mats.get(c)!);
const SHADOW = new THREE.MeshBasicMaterial({ color: 0x08121c, transparent: true, opacity: 0.26, depthWrite: false });

function part(parent: THREE.Object3D, g: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0): THREE.Group {
  const p = new THREE.Group();
  p.add(new THREE.Mesh(g, mat(color)), new THREE.Mesh(g, INK));
  p.position.set(x, y, z);
  p.userData.rigid = true;
  parent.add(p);
  return p;
}

function shadow(parent: THREE.Object3D, rx: number, rz: number) {
  const s = new THREE.Mesh(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), SHADOW);
  s.scale.set(rx, 1, rz);
  s.position.y = 0.03;
  s.renderOrder = 2;
  parent.add(s);
}

/**
 * `outfit` dresses the figure in alpine costume: a `dirndl` (bodice in `coat`, white blouse, full skirt in `skirt`, apron) or
 * `lederhosen` (white shirt, braces, leather shorts, knee socks). `tyrolean` turns the hat into a felt hat with band and
 * feather. `hairStyle` adds `braids` or a `bun` behind the head.
 */
export interface FigureOpts {
  skin?: number; coat?: number; legs?: number; hair?: number; hat?: number; scarf?: number; dress?: boolean; apron?: number; build?: number;
  outfit?: 'dirndl' | 'lederhosen'; skirt?: number; tyrolean?: boolean; hairStyle?: 'braids' | 'bun';
}
/**
 * How a figure stands and moves. Every field is optional and the defaults are a relaxed, breathing idle.
 * - `walk` is the gait phase in radians and `stride` its size (0.5 is a brisk walk): legs swing with knee flex in
 *   the swing, heel strike and toe-off, the pelvis drops and rolls over the stance foot and the chest counter-twists.
 * - `armL`/`armR` swing an arm forward and up about the shoulder (1.57 is level, 2.6 is overhead), `reachL`/`reachR`
 *   bring it across the body; `elbowL`/`elbowR` bend the elbow (defaults to a natural bend that grows as the arm lifts).
 * - `gripL`/`gripR` put that hand's palm on a world point, solving shoulder and elbow (two-bone IK); this wins over
 *   `arm`/`reach`/`elbow`. `gripMixL`/`gripMixR` ease between the two: 0 keeps the arm's own pose, 1 (the default)
 *   puts the palm on the grip, so a hand can travel to a prop and leave it again without a snap. `curlL`/`curlR`
 *   close the fingers, 0 open to 1 a fist (a grip curls them by default). `palmL`/`palmR` (with a grip) turn the palm to
 *   face that world direction, fingers flat and open, so a hand lies on a flat prop such as a phone's back or a tray
 *   instead of curling through it.
 * - `bow` leans the upper body forward, `headYaw`/`headPitch` turn the head, `mood` runs from -1, a worried frown
 *   with raised inner brows, to 1, a smile.
 * - `t` is film time for idle life (breathing, weight shift, head drift, blinks, glances); it defaults to the
 *   shared `G.uTime`, which the player sets before every frame, so idle motion is a pure function of film time.
 *   `idle` scales that life (0 freezes it).
 */
export interface FigurePose {
  walk?: number; stride?: number; armL?: number; armR?: number; reachL?: number; reachR?: number; headYaw?: number; headPitch?: number; bow?: number; mood?: number;
  elbowL?: number; elbowR?: number; gripL?: THREE.Vector3 | null; gripR?: THREE.Vector3 | null; gripMixL?: number; gripMixR?: number; palmL?: THREE.Vector3 | null; palmR?: THREE.Vector3 | null; curlL?: number; curlR?: number; t?: number; idle?: number;
}

/** `hand` is the right palm (kept for older films); `handL`/`handR` are the palms, where props are attached. */
export interface Figure {
  root: THREE.Group; hand: THREE.Object3D; handL: THREE.Object3D; handR: THREE.Object3D; pose(p: FigurePose): void;
  /**
   * Holds `o` (attached anywhere on the figure) in both hands: whenever both arms are lifted forward and no grip is
   * given, the palms take its sides, `halfWidth` metres either side of its centre. Pass null to let go.
   */
  carry(o: THREE.Object3D | null, halfWidth?: number): void;
  /**
   * Puts `prop` in a hand: it is parented to that palm with its grip point (its own origin, shifted by `offset`) in
   * the palm and the fingers curled round it, so it follows the hand through any pose or grip. Pass null to empty
   * the hand. Typical props: a phone (screen facing +z) held up to show, a bill, a loaf.
   */
  hold(hand: 'L' | 'R', prop: THREE.Object3D | null, offset?: THREE.Vector3): void;
  /** The skeleton, for films that need a joint: `legs[i].ankle`, `arms[i].wr` and so on (index 0 is left). */
  joints: { pelvis: THREE.Group; spine: THREE.Group; neck: THREE.Group; head: THREE.Group; legs: { hip: THREE.Group; knee: THREE.Group; ankle: THREE.Group }[]; arms: { sh: THREE.Group; el: THREE.Group; wr: THREE.Group }[] };
}

const UP = 0.38, FORE = 0.38, FOOT = 0.06, HIPS = 0.82, ARM_U = 0.26, ARM_F = 0.24, PALM = 0.065, DUTY = 0.58;
/** Half the step length for a stride. */
const gaitHalf = (stride: number) => 0.34 * Math.min(1.2, Math.max(0, stride)) / 0.5 * 0.5 * 1.2;
/**
 * Metres a figure travels per radian of `walk` phase at `stride`. Move a walking figure's root this far per radian
 * (distance = walkSpeed(stride) * walk) and its stance feet stay planted on the ground with no sliding.
 */
export const walkSpeed = (stride: number) => (2 * gaitHalf(stride)) / (DUTY * Math.PI * 2);
const fract = (x: number) => x - Math.floor(x);
const smooth01 = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
const hash = (x: number) => fract(Math.sin(x * 127.1) * 43758.5453);
let figureSeed = 0;

/** Lathe a soft garment: `profile` is [radius, y] from top to hem; the hem ripples into `folds` soft pleats. */
function garment(profile: [number, number][], folds: number, depth: number, start = 0, length = Math.PI * 2): THREE.BufferGeometry {
  const pts = profile.flatMap(([r, y], i) => i ? [1, 2, 3, 4].map((k) => new THREE.Vector2(profile[i - 1][0] + (r - profile[i - 1][0]) * k / 4, profile[i - 1][1] + (y - profile[i - 1][1]) * k / 4)) : [new THREE.Vector2(r, y)]).reverse(), g = new THREE.LatheGeometry(pts, 40, start, length);
  const pos = g.getAttribute('position'), v = new THREE.Vector3(), top = profile[0][1], bot = profile[profile.length - 1][1];
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const a = Math.atan2(v.x, v.z), k = Math.pow(Math.max(0, (top - v.y) / (top - bot)), 1.6), r = Math.hypot(v.x, v.z);
    const f = 1 + depth * k * Math.sin(a * folds) / Math.max(r, 0.05);
    pos.setXYZ(i, v.x * f, v.y, v.z * f);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * A small articulated person, about 1.75 m tall, feet at the origin, facing +x, with storybook proportions (a large
 * head and simple limbs) so it reads in a wide shot. Its skeleton bends: pelvis, spine and neck; shoulder, elbow,
 * wrist and fingers; hip, knee and ankle. Braids, skirts and hat feathers follow the motion.
 */
export function figure(o: FigureOpts = {}): Figure {
  const seed = ++figureSeed * 7.31;
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  shadow(root, 0.42, 0.34);
  const skin = o.skin ?? 0xf0c8a0, coat = o.coat ?? 0x3d6f9e, b = o.build ?? 1;
  const dirndl = o.outfit === 'dirndl', leder = o.outfit === 'lederhosen', dress = o.dress || dirndl;
  const legC = leder ? 0xf4efe4 : o.legs ?? 0x3a3f4a, leather = o.legs ?? 0x6b4a2e, shirt = 0xfbf6ec, boot = 0x3a2618;
  const pelvis = new THREE.Group();
  pelvis.position.y = HIPS;
  body.add(pelvis);

  type Leg = { hip: THREE.Group; knee: THREE.Group; ankle: THREE.Group; s: number; sole: THREE.Object3D[] };
  const leg = (s: number): Leg => {
    const hip = new THREE.Group(), knee = new THREE.Group(), ankle = new THREE.Group();
    hip.position.set(0, 0, s * 0.11);
    knee.position.y = -UP;
    ankle.position.y = -FORE;
    pelvis.add(hip); hip.add(knee); knee.add(ankle);
    part(hip, new THREE.CapsuleGeometry(0.088, UP - 0.06, 3, 10).translate(0, -UP / 2, 0), leder ? skin : legC);
    if (leder) part(hip, new THREE.CylinderGeometry(0.108, 0.112, 0.27, 12).translate(0, -0.1, 0), leather);
    part(knee, new THREE.SphereGeometry(0.082, 10, 8), leder ? skin : legC);
    part(knee, new THREE.CapsuleGeometry(0.078, FORE - 0.08, 3, 10).translate(0, -FORE / 2, 0), legC);
    part(knee, new THREE.CylinderGeometry(0.083, 0.088, 0.12, 10).translate(0, -FORE + 0.07, 0), boot);
    part(ankle, new THREE.CapsuleGeometry(0.074, 0.11, 3, 10).rotateZ(Math.PI / 2).scale(1, 0.78, 1).translate(0.05, -FOOT * 0.45, 0), boot);
    const sole = [-0.06, 0.05, 0.16].map((x) => { const m = new THREE.Object3D(); m.position.set(x, x === 0.05 ? -0.085 : -0.072, 0); ankle.add(m); return m; });
    return { hip, knee, ankle, s, sole };
  };
  const legs = [leg(-1), leg(1)];
  if (!dress) part(pelvis, new THREE.CapsuleGeometry(0.115 * b, 0.12, 4, 14).rotateX(Math.PI / 2).scale(0.95, 1.1, 1).translate(0, -0.035, 0), leder ? leather : legC);

  if (dirndl || dress) {
    const len = dirndl ? 0.6 : 0.95, hem = (dirndl ? 0.44 : 0.4) * b;
    const skirt = new THREE.Group();
    skirt.position.y = dirndl ? 0.22 : 0.62;
    pelvis.add(skirt);
    const bell: [number, number][] = [[0.17 * b, 0], [0.24 * b, -0.08], [hem * 0.86, -len * 0.55], [hem, -len], [hem * 0.97, -len - 0.012]];
    part(skirt, garment(bell, 9, 0.018), dirndl ? o.skirt ?? 0x8a3b4a : coat);
    if (o.apron !== undefined) part(skirt, garment(bell.slice(0, 4).map(([r, y], i) => [r * 1.04 + 0.012, i === 3 ? y * 0.86 : y] as [number, number]), 9, 0.018, Math.PI / 2 - 0.85, 1.7), o.apron);
    pelvis.userData.skirt = skirt;
  }

  const spine = new THREE.Group();
  pelvis.add(spine);
  if (dirndl) {
    part(spine, new THREE.CylinderGeometry(0.18 * b, 0.2 * b, 0.4, 16).translate(0, 0.44, 0), coat);
    part(spine, new THREE.CylinderGeometry(0.155 * b, 0.18 * b, 0.12, 16).translate(0, 0.66, 0), shirt);
    part(spine, new THREE.TorusGeometry(0.195 * b, 0.018, 6, 18).rotateX(Math.PI / 2).translate(0, 0.25, 0), coat);
  } else if (leder) {
    part(spine, new THREE.CylinderGeometry(0.19 * b, 0.23 * b, 0.62, 14).translate(0, 0.35, 0), o.coat ?? shirt);
    part(spine, new THREE.CylinderGeometry(0.235 * b, 0.235 * b, 0.12, 14).translate(0, 0.04, 0), leather);
    for (const s of [-1, 1]) part(spine, new THREE.BoxGeometry(0.03, 0.62, 0.045).translate(0.2 * b, 0.36, s * 0.085), leather);
    part(spine, new THREE.BoxGeometry(0.03, 0.05, 0.2).translate(0.205 * b, 0.48, 0), leather);
  } else if (!dress) part(spine, new THREE.CylinderGeometry(0.19 * b, 0.26 * b, 0.68, 14).translate(0, 0.32, 0), coat);
  else part(spine, new THREE.CylinderGeometry(0.19 * b, 0.22 * b, 0.4, 14).translate(0, 0.46, 0), coat);
  const yoke = dirndl ? 0.155 * b : 0.19 * b;
  part(spine, new THREE.SphereGeometry(yoke, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.42, 1.25), dirndl ? shirt : leder ? o.coat ?? shirt : coat, 0, dirndl ? 0.72 : 0.66, 0);
  if (o.apron !== undefined && !dirndl && !dress) part(spine, garment([[0.22 * b, 0.6], [0.24 * b, 0.4], [0.29 * b, 0.0]], 4, 0.008, Math.PI / 2 - 0.85, 1.7), o.apron);
  if (o.scarf !== undefined) part(spine, new THREE.TorusGeometry(0.15, 0.065, 8, 16).rotateX(Math.PI / 2), o.scarf, 0, 0.68, 0);

  type Arm = { sh: THREE.Group; el: THREE.Group; wr: THREE.Group; fingers: THREE.Group; tip: THREE.Group; thumb: THREE.Group; palm: THREE.Object3D; s: number };
  const sleeve = dirndl || leder ? shirt : coat;
  const arm = (s: number): Arm => {
    const sh = new THREE.Group(), el = new THREE.Group(), wr = new THREE.Group(), fingers = new THREE.Group(), tip = new THREE.Group(), thumb = new THREE.Group(), palm = new THREE.Object3D();
    sh.position.set(0, 0.6, s * 0.25 * b);
    el.position.y = -ARM_U;
    wr.position.y = -ARM_F;
    spine.add(sh); sh.add(el); el.add(wr);
    part(sh, new THREE.SphereGeometry(dirndl ? 0.1 : 0.074, 12, 10).scale(1, 0.95, 1), sleeve);
    part(sh, new THREE.CapsuleGeometry(0.066, ARM_U - 0.04, 3, 10).translate(0, -ARM_U / 2, 0), sleeve);
    part(el, new THREE.SphereGeometry(0.06, 10, 8), sleeve);
    part(el, new THREE.CapsuleGeometry(0.058, ARM_F - 0.06, 3, 10).translate(0, -ARM_F / 2, 0), sleeve);
    part(el, new THREE.CylinderGeometry(0.062, 0.066, 0.05, 12).translate(0, -ARM_F + 0.04, 0), dirndl || leder ? shirt : coat);
    part(wr, new THREE.CapsuleGeometry(0.024, 0.032, 4, 14).scale(0.7, 1, 1.85).translate(0.004, -0.036, 0), skin);
    fingers.position.set(0.004, -0.064, 0);
    wr.add(fingers);
    part(fingers, new THREE.CapsuleGeometry(0.0225, 0.026, 4, 14).scale(0.68, 1, 1.8).translate(0, -0.014, 0), skin);
    tip.position.y = -0.034;
    fingers.add(tip);
    part(tip, new THREE.CapsuleGeometry(0.0205, 0.016, 4, 14).scale(0.66, 1, 1.75).translate(0, -0.012, 0), skin);
    thumb.position.set(0.012, -0.03, s * -0.036);
    thumb.rotation.set(s * 0.35, 0, 0.45);
    wr.add(thumb);
    part(thumb, new THREE.CapsuleGeometry(0.0135, 0.022, 4, 10).scale(0.85, 1, 1).translate(0, -0.02, 0), skin);
    palm.position.set(0.035, -PALM, 0);
    wr.add(palm);
    return { sh, el, wr, fingers, tip, thumb, palm, s };
  };
  const arms = [arm(-1), arm(1)];

  const neck = new THREE.Group();
  neck.position.y = 0.72;
  spine.add(neck);
  part(neck, new THREE.CylinderGeometry(0.06, 0.07, 0.14, 10).translate(0, 0.05, 0), skin);
  const head = new THREE.Group();
  head.position.y = 0.2;
  neck.add(head);
  part(head, new THREE.SphereGeometry(0.23, 28, 20).scale(1, 0.98, 1), skin);
  const hsl = new THREE.Color(o.hair ?? 0x3b2a20).getHSL({ h: 0, s: 0, l: 0 });
  /** Near-black hair has no cel form left in shadow, so it keeps at least a dark-brown lightness. */
  const hair = new THREE.Color().setHSL(hsl.h, hsl.s, Math.max(hsl.l, 0.22)).getHex();
  part(head, new THREE.SphereGeometry(0.247, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.56).rotateZ(0.5), hair, -0.012, 0.012, 0);
  part(head, new THREE.SphereGeometry(0.243, 28, 8, 0, Math.PI * 2, 0, Math.PI * 0.24).rotateZ(-0.3).rotateX(0.22), hair);
  for (const s of [-1, 1]) {
    part(head, new THREE.SphereGeometry(0.045, 10, 8).scale(0.5, 1, 0.8), skin, 0.0, 0.0, s * 0.235);
    part(head, new THREE.SphereGeometry(0.11, 18, 14).scale(0.9, 1.05, 0.55), hair, -0.03, 0.04, s * 0.19);
  }
  if (o.hairStyle === 'bun') part(head, new THREE.SphereGeometry(0.1, 12, 10), hair, -0.2, 0.12, 0);
  const braids: THREE.Group[] = [];
  if (o.hairStyle === 'braids') for (const s of [-1, 1]) {
    const top = new THREE.Group();
    top.position.set(-0.12, -0.1, s * 0.17);
    head.add(top);
    let at: THREE.Group = top;
    for (let k = 0; k < 3; k++) {
      const seg = new THREE.Group();
      seg.position.y = k ? -0.1 : 0;
      at.add(seg);
      part(seg, new THREE.SphereGeometry(0.05 - k * 0.006, 10, 8).scale(1, 1.15, 1), hair, 0, -0.03, 0);
      part(seg, new THREE.SphereGeometry(0.046 - k * 0.006, 10, 8).scale(1, 1.15, 1), hair, 0, -0.08, 0);
      at = seg;
      braids.push(seg);
    }
    part(at, new THREE.SphereGeometry(0.03, 8, 6), o.scarf ?? 0xc8553d, 0, -0.13, 0);
  }

  const brows: THREE.Mesh[] = [], eyes: THREE.Group[] = [];
  const face = (g: THREE.BufferGeometry, color: number, x: number, y: number, z: number, parent: THREE.Object3D = head) => { const m = new THREE.Mesh(g, mat(color)); m.position.set(x, y, z); parent.add(m); return m; };
  for (const s of [-1, 1]) {
    const e = new THREE.Group();
    e.position.set(0.205, 0.012, s * 0.082);
    head.add(e);
    face(new THREE.SphereGeometry(0.031, 12, 10).scale(0.6, 1.2, 1), 0x1b0f00, 0, 0, 0, e);
    face(new THREE.SphereGeometry(0.0095, 8, 6), 0xffffff, 0.017, 0.013, s * -0.004, e);
    face(new THREE.SphereGeometry(0.0045, 8, 6), 0xffffff, 0.0168, -0.012, s * 0.008, e);
    eyes.push(e);
    brows.push(face(new THREE.TorusGeometry(0.05, 0.0072, 5, 12, Math.PI * 0.38).rotateZ(Math.PI * 0.31).translate(0, -0.05, 0).rotateY(Math.PI / 2), hair, 0.207, 0.072, s * 0.084));
    brows[brows.length - 1].rotation.y = -s * 0.37;
    face(new THREE.SphereGeometry(0.036, 12, 8).scale(0.3, 0.7, 1), 0xf2958a, 0.2, -0.045, s * 0.125);
  }
  face(new THREE.SphereGeometry(0.03, 12, 10).scale(1.3, 0.9, 0.9), new THREE.Color(skin).lerp(new THREE.Color(0xe07a6a), 0.2).getHex(), 0.214, -0.028, 0);
  const mouth = face(new THREE.TorusGeometry(0.035, 0.008, 4, 12, Math.PI * 0.8).rotateY(Math.PI / 2).rotateX(Math.PI + Math.PI * 0.1).translate(0, 0.02, 0), 0x7a2e22, 0.21, -0.095, 0);
  const grin = face(new THREE.SphereGeometry(0.03, 14, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(0.3, 0.62, 1), 0x5a1a16, 0.206, -0.089, 0);
  let feather: THREE.Group | undefined;
  if (o.hat !== undefined && o.tyrolean) {
    part(head, new THREE.CylinderGeometry(0.33, 0.34, 0.03, 20).rotateZ(-0.06), o.hat, 0, 0.17, 0);
    part(head, new THREE.CylinderGeometry(0.15, 0.2, 0.22, 16).scale(1.12, 1, 0.92), o.hat, 0, 0.29, 0);
    part(head, new THREE.CylinderGeometry(0.2, 0.205, 0.045, 16).scale(1.12, 1, 0.92), 0x3a2618, 0, 0.2, 0);
    feather = new THREE.Group();
    feather.position.set(-0.13, 0.25, 0.18);
    head.add(feather);
    part(feather, new THREE.ConeGeometry(0.035, 0.24, 6).scale(1, 1, 0.45).translate(0, 0.12, 0).rotateZ(1.05), 0xf2e6c8);
  } else if (o.hat !== undefined) {
    part(head, new THREE.CylinderGeometry(0.44, 0.46, 0.035, 20), o.hat, 0, 0.15, 0);
    part(head, new THREE.CylinderGeometry(0.17, 0.21, 0.17, 16), o.hat, 0, 0.24, 0);
  }
  root.updateMatrixWorld(true);
  let hipR = 0;
  const at = new THREE.Vector3();
  pelvis.traverse((m) => {
    const g = (m as THREE.Mesh).geometry;
    if (!g || arms.some((a) => isIn(m, a.sh))) return;
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) { at.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); if (at.y > 0.78 && at.y < 1.02) hipR = Math.max(hipR, Math.hypot(at.x, at.z)); }
  });
  /** How far a lowered arm swings out (beyond the usual slight tuck) so the hand hangs clear of the hips, coat or skirt. */
  const hang = Math.max(Math.asin(Math.min(1, (hipR + 0.045 - 0.25 * b) / 0.5)), -0.06) + 0.06;
  sealRig(root);

  const inv = new THREE.Matrix4(), basis = new THREE.Matrix4(), d = new THREE.Vector3(), perp = new THREE.Vector3(), upper = new THREE.Vector3();
  const elbowAt = new THREE.Vector3(), fd = new THREE.Vector3(), X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3(), pole = new THREE.Vector3();
  const WRIST = -Math.atan2(0.035, PALM), REACH = ARM_F + Math.hypot(0.035, PALM);
  const qHand = new THREE.Quaternion(), qOwn = new THREE.Quaternion(), wristAt = new THREE.Vector3();
  /**
   * Two-bone IK in the spine's space: shoulder and elbow turn so arm `a`'s palm lands on world point `world`. With
   * `face`, the palm also turns to face that world direction, fingers flat along the surface and pointing up and away
   * from the shoulder, eased in by `k` from the hand's own orientation, and the IK lands the wrist where that palm needs it.
   */
  const reachTo = (a: Arm, world: THREE.Vector3, face?: THREE.Vector3, k = 1) => {
    spine.updateWorldMatrix(true, false);
    wristAt.copy(world);
    if (face) {
      if (k < 1) { a.wr.updateWorldMatrix(true, false); a.wr.getWorldQuaternion(qOwn); }
      X.copy(face).normalize();
      Y.copy(world).sub(a.sh.getWorldPosition(Z)).normalize();
      Y.y += 0.8;
      Y.addScaledVector(X, -Y.dot(X)).negate().normalize();
      qHand.setFromRotationMatrix(basis.makeBasis(X, Y, Z.crossVectors(X, Y)));
      if (k < 1) qHand.slerpQuaternions(qOwn, qHand, k);
      wristAt.sub(Z.copy(a.palm.position).setX(0.024).applyQuaternion(qHand));
    }
    d.copy(wristAt).applyMatrix4(inv.copy(spine.matrixWorld).invert()).sub(a.sh.position);
    const u = ARM_U, f = face ? ARM_F : REACH, L = Math.min(Math.max(d.length(), Math.abs(u - f) + 1e-3), (u + f) * 0.9995);
    d.setLength(L);
    const dn = d.clone().normalize(), alpha = Math.acos(Math.min(1, Math.max(-1, (u * u + L * L - f * f) / (2 * u * L))));
    pole.set(-0.45, -1, a.s * 0.55);
    perp.copy(pole).addScaledVector(dn, -pole.dot(dn));
    if (perp.lengthSq() < 1e-8) perp.set(-1, 0, 0);
    perp.normalize();
    upper.copy(dn).multiplyScalar(Math.cos(alpha)).addScaledVector(perp, Math.sin(alpha));
    elbowAt.copy(upper).multiplyScalar(u);
    fd.copy(d).sub(elbowAt).normalize();
    Y.copy(upper).negate();
    X.copy(fd).addScaledVector(upper, -fd.dot(upper));
    if (X.lengthSq() < 1e-8) X.copy(perp).negate();
    X.normalize();
    Z.crossVectors(X, Y);
    a.sh.quaternion.setFromRotationMatrix(basis.makeBasis(X, Y, Z));
    a.el.rotation.set(0, 0, Math.acos(Math.min(1, Math.max(-1, upper.dot(fd)))));
    a.wr.rotation.set(0, 0, WRIST);
    if (face) { a.el.updateWorldMatrix(true, false); a.wr.quaternion.copy(a.el.getWorldQuaternion(qOwn).invert().multiply(qHand)); }
  };

  let carried: THREE.Object3D | null = null, carryHalf = 0.3;
  const heldBy: (THREE.Object3D | null)[] = [null, null];
  const side = new THREE.Vector3(), lateral = new THREE.Vector3(), gripAt = [new THREE.Vector3(), new THREE.Vector3()], mixAt = new THREE.Vector3();
  return {
    carry(o, halfWidth = 0.3) { carried = o; carryHalf = halfWidth; },
    hold(hand, prop, offset) {
      const i = hand === 'L' ? 0 : 1, palm = arms[i].palm;
      if (heldBy[i] && heldBy[i] !== prop) heldBy[i]!.removeFromParent();
      heldBy[i] = prop;
      if (!prop) return;
      palm.add(prop);
      prop.position.copy(offset ?? new THREE.Vector3(0.012, -0.015, 0));
      prop.rotation.set(0, 0, 0);
    },
    root, hand: arms[1].palm, handL: arms[0].palm, handR: arms[1].palm, joints: { pelvis, spine, neck, head, legs, arms },
    pose(p) {
      const t = p.t ?? G.uTime.value, w = p.walk ?? 0, st = Math.min(1.2, Math.max(0, p.stride ?? 0));
      const life = (p.idle ?? 1) * (1 - Math.min(1, st * 2.5)), still = 1 - Math.min(1, st * 2.5);
      const ph = (i: number) => w + (i ? Math.PI : 0);

      // Legs: each foot follows a gait path (planted and sliding back at ground speed through stance, lifted and arcing
      // forward through swing) and the leg reaches it with two-bone IK; the pelvis sits as high as both legs allow,
      // which gives the walk its natural bob. With `walkSpeed(stride)` metres per radian of travel, stance feet stay put.
      const A = gaitHalf(st), lift = 0.11 * Math.min(1, st * 2);
      pelvis.rotation.set(Math.sin(w) * st * 0.08, -Math.sin(w) * st * 0.12, 0);
      const foot = legs.map((l, i) => {
        const u = fract(ph(i) / (Math.PI * 2) + 0.25);
        if (u < DUTY) return { x: A - (2 * A * u) / DUTY, y: 0, pitch: 0 };
        const k = (u - DUTY) / (1 - DUTY), e = k * k * (3 - 2 * k);
        return { x: -A + 2 * A * e, y: lift * Math.sin(Math.PI * k), pitch: st * (0.7 * Math.sin(Math.PI * Math.min(1, k * 1.6)) - 0.45 * smooth01((k - 0.75) / 0.25)) };
      });
      let h = HIPS;
      for (const f of foot) h = Math.min(h, FOOT + f.y + Math.sqrt(Math.max(0, (UP + FORE) * (UP + FORE) * 0.996 - f.x * f.x)));
      h -= Math.sin(w * 2) * 0.004 * st;
      body.position.set(0, 0, 0);
      pelvis.position.y = h;
      body.updateMatrix();
      root.updateMatrixWorld(true);
      legs.forEach((l, i) => {
        const f = foot[i];
        d.set(f.x, FOOT + f.y, l.s * 0.11).applyMatrix4(body.matrixWorld).applyMatrix4(inv.copy(pelvis.matrixWorld).invert()).sub(l.hip.position);
        const dx = d.x, dy = d.y, D = Math.min(Math.hypot(dx, dy), (UP + FORE) * 0.9995);
        const phi = Math.atan2(dx, -dy), alpha = Math.acos(Math.min(1, Math.max(-1, (UP * UP + D * D - FORE * FORE) / (2 * UP * D))));
        const knee = Math.PI - Math.acos(Math.min(1, Math.max(-1, (UP * UP + FORE * FORE - D * D) / (2 * UP * FORE))));
        l.hip.rotation.set(0, 0, phi + alpha);
        l.knee.rotation.set(0, 0, -knee);
        l.ankle.rotation.set(0, 0, -(phi + alpha - knee) - pelvis.rotation.z + f.pitch);
      });
      root.updateMatrixWorld(true);
      let lowest = Infinity;
      const toBody = inv.copy(body.matrixWorld).invert();
      for (const l of legs) for (const m of l.sole) lowest = Math.min(lowest, d.setFromMatrixPosition(m.matrixWorld).applyMatrix4(toBody).y);
      if (st < 0.01) body.position.y = -lowest;

      // Pelvis roll and the upper body: counter-twist, bow, breathing and a slow weight shift over planted feet.
      const shift = Math.sin(t * 0.37 + seed) * 0.6 + Math.sin(t * 0.83 + seed * 2) * 0.4, breath = Math.sin(t * 1.7 + seed);
      spine.rotation.set(-pelvis.rotation.x * 0.9 + shift * 0.035 * life, Math.sin(w) * st * 0.3, -(p.bow ?? 0) - st * 0.08);
      spine.position.set(0, 0, shift * 0.015 * life + Math.sin(w) * st * 0.035);
      spine.scale.set(1 + breath * 0.006 * life, 1 + breath * 0.012 * life, 1 + breath * 0.006 * life);
      const skirt = pelvis.userData.skirt as THREE.Group | undefined;
      if (skirt) { skirt.rotation.set(Math.sin(w - 0.9) * st * 0.12 + shift * 0.02 * life, 0, -Math.sin(w * 2 - 1.2) * st * 0.05); skirt.scale.set(1 + st * 0.05, 1, 1 + st * 0.05); }

      // Arms: counter swing in a walk; a natural elbow bend unless a grip target asks for IK.
      const carrying = !!carried && !p.gripL && !p.gripR && (p.armL ?? 0) > 0.8 && (p.armR ?? 0) > 0.8;
      if (carrying) {
        root.updateMatrixWorld(true);
        carried!.getWorldPosition(side);
        lateral.set(0, 0, 1).transformDirection(spine.matrixWorld);
        gripAt[0].copy(side).addScaledVector(lateral, -carryHalf);
        gripAt[1].copy(side).addScaledVector(lateral, carryHalf);
      }
      arms.forEach((a, i) => {
        const R = i === 1, grip = (R ? p.gripR : p.gripL) ?? (carrying ? gripAt[i] : undefined);
        const armA = (R ? p.armR : p.armL) ?? 0, reach = (R ? p.reachR : p.reachL) ?? 0, holding = Math.min(1, Math.max(0, (armA - 0.6) / 0.7)), counter = -Math.sin(ph(i)) * st * 0.8 * (1 - 0.85 * holding);
        const mixK = grip ? Math.min(1, Math.max(0, (R ? p.gripMixR : p.gripMixL) ?? 1)) : 0;
        const face = grip ? (R ? p.palmR : p.palmL) ?? undefined : undefined;
        const curl = (R ? p.curlR : p.curlL) ?? (heldBy[i] ? 0.7 : 0.25 + 0.05 * breath * life + (face ? -0.15 : 0.6) * mixK);
        a.fingers.rotation.set(0, 0, curl * 0.85);
        a.tip.rotation.set(0, 0, curl * 1.05);
        a.thumb.rotation.set(a.s * 0.35, 0, (face ? -0.1 : 0.45) + curl * 0.6);
        if (mixK >= 1) { reachTo(a, grip!, face); return; }
        a.sh.rotation.set(R ? reach : -reach, 0, armA + counter + breath * 0.02 * life);
        const low = 1 - Math.min(1, Math.max(0, armA));
        a.sh.rotation.x += a.s * (0.06 + 0.04 * Math.min(1, armA) - hang * low);
        const elbow = (R ? p.elbowR : p.elbowL) ?? (0.18 + 0.32 * Math.min(1, Math.max(0, armA) / 2.2) + Math.max(0, Math.sin(ph(i))) * st * 0.5 + 0.03 * Math.sin(t * 0.9 + seed + i) * life);
        a.el.rotation.set(0, 0, elbow);
        a.wr.rotation.set(0, a.s * 1.4 * low, -0.1 - elbow * 0.15);
        if (mixK > 0) { a.palm.updateWorldMatrix(true, false); reachTo(a, mixAt.setFromMatrixPosition(a.palm.matrixWorld).lerp(grip!, mixK), face, mixK); }
      });

      // Head: turns and nods, a slow drift and a walk-stabilised gaze.
      const drift = (Math.sin(t * 0.53 + seed) * 0.6 + Math.sin(t * 1.31 + seed * 3) * 0.25) * life;
      neck.rotation.set(-spine.rotation.x * 0.5, -spine.rotation.y * 0.7 + (p.headYaw ?? 0) * 0.35, (p.headPitch ?? 0) * 0.3);
      head.rotation.set(drift * 0.04, (p.headYaw ?? 0) * 0.65 + drift * 0.07, (p.headPitch ?? 0) * 0.7 + Math.sin(t * 0.71 + seed) * 0.03 * life + Math.sin(w * 2) * st * 0.03);

      // Eyes: blinks every few seconds and small glances between fixations.
      const period = 3.2, beat = t / period + hash(seed), k = Math.floor(beat), since = (fract(beat) - 0.35 * hash(k + seed)) * period;
      const blink = since > 0 && since < 0.2 ? Math.sin((since / 0.2) * Math.PI) : 0;
      const look = Math.floor(t * 0.9 + seed), gx = (hash(look) - 0.5) * 0.012 * (0.4 + still), gy = (hash(look + 3) - 0.5) * 0.008 * (0.4 + still);
      const mood = p.mood ?? 0.6, joy = smooth01((mood - 0.65) / 0.35), squint = 0.2 * joy;
      for (const e of eyes) { e.scale.set(1, (1 - 0.9 * blink) * (1 - squint), 1); e.position.z = (e.position.z > 0 ? 0.082 : -0.082) + gx; e.position.y = 0.012 + gy - 0.024 * blink; e.children[1].visible = e.children[2].visible = blink < 0.5; }

      // Follow-through: braids hang with gravity and trail the walk; the feather bounces.
      const lean = spine.rotation.z + neck.rotation.z + head.rotation.z, roll = pelvis.rotation.x + spine.rotation.x + neck.rotation.x + head.rotation.x;
      braids.forEach((g, i) => {
        const k2 = i % 3, first = k2 === 0;
        g.rotation.set(first ? -roll : Math.sin(w - 1 - k2 * 0.5) * st * 0.12, 0, first ? -lean + Math.sin(w * 2 - 1.1) * st * 0.18 + Math.sin(t * 1.2 + seed + i) * 0.03 * life : -Math.sin(w * 2 - 1.6 - k2 * 0.5) * st * 0.2);
      });
      if (feather) feather.rotation.set(0, 0, Math.sin(w * 2 - 0.8) * st * 0.25 + Math.sin(t * 2.1 + seed) * 0.05 * life);

      mouth.scale.set(1, Math.sign(mood || 1) * (0.5 + 0.5 * Math.abs(mood)), 1);
      grin.visible = joy > 0.01;
      grin.scale.set(1, joy, 0.4 + 0.6 * joy);
      brows.forEach((br, i) => { br.rotation.x = (i ? 1 : -1) * 0.5 * Math.max(0, -mood); br.position.y = 0.072 + 0.012 * Math.abs(mood); });
    },
  };
}

/** `blink` closes the eyes (a slow blink is a cat's hello), `paw` lifts the right forepaw in a wave, `tilt` rolls the head. */
const isIn = (o: THREE.Object3D, root: THREE.Object3D): boolean => (o === root ? true : o.parent ? isIn(o.parent, root) : false);

export interface CatPose { sit?: number; walk?: number; tail?: number; headYaw?: number; headPitch?: number; blink?: number; paw?: number; tilt?: number; /** film time for ear flicks, breathing and an idle blink; defaults to `G.uTime` */ t?: number }
export interface Cat { root: THREE.Group; pose(p: CatPose): void }

/**
 * A friendly storybook cat about 0.5 m long that settles onto the ground in any pose (paws and rump rest at y = 0), facing +x: a large head with round amber eyes,
 * a pink nose and a small smile. `collar` adds a collar with a gold tag. `sit` goes from standing (0) to seated (1).
 */
export function cat(fur = 0xe8a04a, belly = 0xfff3dc, eye = 0xd99a2b, collar?: number): Cat {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  shadow(root, 0.32, 0.2);
  const trunk = new THREE.Group(), at = new THREE.Vector3();
  trunk.position.set(-0.17, 0.2, 0);
  body.add(trunk);
  part(trunk, new THREE.CapsuleGeometry(0.105, 0.3, 3, 10).rotateZ(Math.PI / 2).translate(0.17, 0.06, 0), fur);
  part(trunk, new THREE.SphereGeometry(0.085, 8, 6).scale(1.6, 0.8, 0.85).translate(0.2, -0.01, 0), belly);
  const legs = [[0.32, -1], [0.32, 1], [0.02, -1], [0.02, 1]].map(([x, s]) => {
    const g = new THREE.Group();
    g.position.set(x, 0.04, s * 0.07);
    part(g, new THREE.CapsuleGeometry(0.034, 0.15, 2, 6).translate(0, -0.11, 0), fur);
    part(g, new THREE.SphereGeometry(0.04, 8, 6).scale(1.2, 0.8, 1), belly, 0.01, -0.19, 0);
    trunk.add(g);
    return g;
  });
  const head = new THREE.Group();
  head.position.set(0.43, 0.19, 0);
  trunk.add(head);
  part(head, new THREE.SphereGeometry(0.135, 14, 11).scale(0.95, 0.88, 1.12), fur);
  part(head, new THREE.SphereGeometry(0.06, 10, 8).scale(0.9, 0.7, 1.35), belly, 0.085, -0.045, 0);
  const lids: THREE.Mesh[] = [], ears: THREE.Group[] = [];
  const bit = (g: THREE.BufferGeometry, color: number, x: number, y: number, z: number) => { const m = new THREE.Mesh(g, mat(color)); m.position.set(x, y, z); head.add(m); return m; };
  for (const s of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(-0.01, 0.1, s * 0.07);
    head.add(ear);
    ears.push(ear);
    part(ear, new THREE.ConeGeometry(0.055, 0.12, 4).rotateY(Math.PI / 4).rotateX(s * -0.25).translate(0, 0.03, s * 0.006), fur);
    part(ear, new THREE.ConeGeometry(0.032, 0.075, 4).rotateY(Math.PI / 4).rotateX(s * -0.25).translate(0.022, 0.022, s * 0.004), 0xf2a6a0);
    const e = new THREE.Group();
    e.position.set(0.108, 0.022, s * 0.05);
    head.add(e);
    e.add(new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10).scale(0.5, 1.1, 1), mat(eye)));
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8).scale(0.5, 1.15, 1), mat(0x1b0f00));
    pupil.position.x = 0.006;
    e.add(pupil);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.0075, 6, 5), mat(0xffffff));
    glint.position.set(0.014, 0.012, s * -0.006);
    e.add(glint);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.033, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.55, 1.1, 1.06), mat(fur));
    lid.position.x = 0.002;
    e.add(lid);
    lids.push(lid);
    bit(new THREE.SphereGeometry(0.022, 8, 6).scale(0.3, 0.6, 1), 0xf29a8a, 0.11, -0.035, s * 0.078);
    for (const k of [-1, 1]) {
      const wsk = bit(new THREE.BoxGeometry(0.003, 0.003, 0.075), 0x6b4a35, 0.1, -0.03 + k * 0.012, s * 0.13);
      wsk.rotation.x = s * k * 0.18;
    }
  }
  bit(new THREE.SphereGeometry(0.014, 8, 6).scale(0.8, 0.7, 1.2), 0xe07a86, 0.138, -0.022, 0);
  for (const s of [-1, 1]) {
    const m = bit(new THREE.TorusGeometry(0.012, 0.0035, 4, 8, Math.PI).rotateY(Math.PI / 2).rotateX(Math.PI), 0x5a2e22, 0.131, -0.038, s * 0.011);
    m.scale.setScalar(1);
  }
  if (collar !== undefined) {
    part(trunk, new THREE.TorusGeometry(0.075, 0.016, 6, 16).rotateY(Math.PI / 2).rotateZ(0.9), collar, 0.34, 0.12, 0);
    part(trunk, new THREE.CylinderGeometry(0.024, 0.024, 0.008, 14).rotateZ(Math.PI / 2).rotateY(0.15), 0xf2c14a, 0.405, 0.055, 0);
  }
  const tail: THREE.Group[] = [];
  let link: THREE.Object3D = trunk;
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group();
    g.position.set(i ? -0.085 : -0.02, i ? 0 : 0.08, 0);
    part(g, new THREE.CapsuleGeometry(0.026, 0.07, 2, 6).rotateZ(Math.PI / 2).translate(-0.045, 0, 0), i > 3 ? belly : fur);
    link.add(g);
    link = g;
    tail.push(g);
  }

  // A seated cat is its own shape, not a tilted standing one: a pear of a body on rounded haunches, front legs straight
  // down, hind feet tucked in front and the tail wrapped around the paws.
  const seated = new THREE.Group();
  root.add(seated);
  part(seated, new THREE.SphereGeometry(0.125, 14, 12).scale(0.92, 1.3, 0.95), fur, 0, 0.18, 0);
  part(seated, new THREE.SphereGeometry(0.135, 14, 10).scale(1.08, 0.72, 1.12), fur, -0.035, 0.095, 0);
  part(seated, new THREE.SphereGeometry(0.075, 12, 10).scale(0.55, 1.25, 0.95), belly, 0.085, 0.2, 0);
  for (const s of [-1, 1]) {
    part(seated, new THREE.SphereGeometry(0.075, 10, 8).scale(1.35, 0.95, 0.7), fur, -0.02, 0.075, s * 0.105);
    part(seated, new THREE.SphereGeometry(0.04, 8, 6).scale(1.5, 0.7, 1), belly, 0.085, 0.022, s * 0.125);
  }
  const fore = [-1, 1].map((s) => {
    const g = new THREE.Group();
    g.position.set(0.075, 0.25, s * 0.05);
    part(g, new THREE.CapsuleGeometry(0.03, 0.17, 3, 8).translate(0, -0.12, 0), fur);
    const pawJ = new THREE.Group();
    pawJ.position.y = -0.21;
    g.add(pawJ);
    part(pawJ, new THREE.SphereGeometry(0.036, 10, 8).scale(1.25, 0.75, 1), belly, 0.012, -0.018, 0);
    g.userData.paw = pawJ;
    seated.add(g);
    return g;
  });
  const wrap = new THREE.Group();
  wrap.position.set(-0.02, 0.028, 0);
  seated.add(wrap);
  part(wrap, new THREE.TorusGeometry(0.155, 0.027, 8, 28, Math.PI * 1.15).rotateX(-Math.PI / 2).rotateY(Math.PI * 0.62), fur);
  const tip = new THREE.Group();
  tip.position.set(0.155 * Math.cos(Math.PI * 0.77), 0.004, 0.155 * Math.sin(Math.PI * 0.23));
  tip.rotation.y = -0.6;
  wrap.add(tip);
  part(tip, new THREE.CapsuleGeometry(0.024, 0.06, 3, 8).rotateZ(Math.PI / 2).translate(0.04, 0, 0), fur);
  part(tip, new THREE.SphereGeometry(0.028, 10, 8), belly, 0.09, 0, 0);
  const neck = new THREE.Group();
  neck.position.set(0.03, 0.36, 0);
  seated.add(neck);
  if (collar !== undefined) {
    part(seated, new THREE.TorusGeometry(0.085, 0.017, 6, 18).rotateX(Math.PI / 2).rotateZ(-0.25), collar, 0.025, 0.315, 0);
    part(seated, new THREE.CylinderGeometry(0.024, 0.024, 0.008, 14).rotateZ(Math.PI / 2), 0xf2c14a, 0.112, 0.28, 0);
  }

  sealRig(root);
  return {
    root,
    pose(p) {
      const sit = p.sit ?? 0, w = p.walk ?? 0, tw = p.tail ?? 0, paw = p.paw ?? 0;
      const sitting = sit >= 0.5;
      seated.visible = sitting;
      body.visible = !sitting;
      const t = p.t ?? G.uTime.value;
      // A cat's own blink: a slow one every few seconds unless the film asks for a particular blink.
      const since = (fract(t / 4.1 + 0.3) - 0.2) * 4.1, own = since > 0 && since < 0.45 ? Math.sin((since / 0.45) * Math.PI) : 0;
      const shut = Math.min(1, Math.max(0, p.blink ?? own));
      for (const l of lids) { l.visible = shut > 0.02; l.rotation.z = (1 - shut) * 1.6; }
      // Ears flick now and then, each on its own clock; ears and head stay alive between the film's cues.
      ears.forEach((e, i) => {
        const k = Math.floor(t / 2.3 + i * 0.47), u = (fract(t / 2.3 + i * 0.47) - 0.6 * hash(k + i * 9)) * 2.3, flick = u > 0 && u < 0.28 ? Math.sin((u / 0.28) * Math.PI) : 0;
        e.rotation.set((i ? -1 : 1) * (0.12 + 0.5 * flick), 0, -0.25 * flick);
      });
      const breath = Math.sin(t * 2.3);
      if (sitting) {
        if (head.parent !== neck) { neck.add(head); head.position.set(0, 0, 0); }
        head.rotation.set((p.tilt ?? 0) + Math.sin(t * 0.7) * 0.03, (p.headYaw ?? 0) + Math.sin(t * 0.43 + 1) * 0.05, (p.headPitch ?? 0) + Math.sin(t * 0.9) * 0.02);
        seated.scale.set(1 + breath * 0.012, 1 + breath * 0.006, 1 + breath * 0.012);
        fore[1].rotation.z = paw * (2.2 + 0.25 * Math.sin(tw * 3));
        fore[1].rotation.x = -paw * 0.3;
        (fore[1].userData.paw as THREE.Group).rotation.z = paw * (0.55 + 0.35 * Math.sin(tw * 3 + 0.8));
        wrap.rotation.y = Math.sin(tw * 0.6) * 0.06;
        tip.rotation.set(0, -0.6 + Math.sin(tw * 0.9) * 0.25, 0.35 + 0.45 * Math.max(0, Math.sin(t * 0.8 + 2)) + Math.sin(tw * 1.7) * 0.15);
        return;
      }
      if (head.parent !== trunk) { trunk.add(head); head.position.set(0.43, 0.19, 0); }
      trunk.rotation.z = sit * 0.82;
      trunk.position.y = 0.2 - sit * 0.07;
      legs.forEach((l, i) => {
        const front = i < 2, sw = Math.sin(w + (i % 2 ? Math.PI : 0) + (front ? 0 : Math.PI)) * 0.5 * (1 - sit);
        l.rotation.z = sw + (front ? -sit * 0.82 : sit * 0.75) + (i === 1 ? paw * (1.9 + 0.25 * Math.sin(tw * 3)) : 0);
        l.rotation.x = i === 1 ? -paw * 0.35 : 0;
      });
      head.rotation.z = -sit * 0.72 + (p.headPitch ?? 0);
      head.rotation.y = p.headYaw ?? 0;
      head.rotation.x = p.tilt ?? 0;
      tail.forEach((g, i) => {
        g.rotation.z = (1 - sit) * ((i ? 0.22 : -0.55) + (i > 3 ? 0.35 : 0)) + sit * (i ? -0.06 : -0.72);
        g.rotation.y = Math.sin(tw - i * 0.7) * 0.3 * (1 - 0.6 * sit) + sit * (i ? 0.42 : 0.2);
      });
      body.position.y = 0;
      body.updateMatrix();
      body.updateMatrixWorld(true);
      const inv = body.matrixWorld.clone().invert(), m = new THREE.Matrix4();
      let low = Infinity;
      body.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || (paw > 0.05 && isIn(o, legs[1]))) return;
        const pos = mesh.geometry.getAttribute('position');
        m.multiplyMatrices(inv, mesh.matrixWorld);
        for (let i = 0; i < pos.count; i += 2) low = Math.min(low, at.fromBufferAttribute(pos, i).applyMatrix4(m).y);
      });
      body.position.y = -low;
    },
  };
}

export interface CowPose { graze?: number; tail?: number; walk?: number; /** film time for chewing, breathing and ear flicks; defaults to `G.uTime` */ t?: number }
export interface Cow { root: THREE.Group; pose(p: CowPose): void }

let cowSeed = 0;

/**
 * A dairy cow about 2.2 m long, hooves at the origin, facing +x. `graze` lowers her head to the grass, where she
 * chews; legs bend at the knee and hock as she walks; ears flick and the tail swishes with a lagging tuft.
 */
export function cow(coat = 0xa8683c, patch = 0xfff6e6): Cow {
  const seed = ++cowSeed * 3.7;
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  shadow(root, 1.25, 0.6);
  part(body, new THREE.CapsuleGeometry(0.46, 1.25, 4, 14).rotateZ(Math.PI / 2).translate(0, 1.12, 0), coat);
  part(body, new THREE.SphereGeometry(0.42, 12, 10).scale(1.1, 0.8, 1.02).translate(-0.35, 1.3, 0), patch);
  part(body, new THREE.SphereGeometry(0.3, 12, 10).scale(1.2, 0.7, 1.04).translate(0.5, 0.98, 0), patch);
  part(body, new THREE.SphereGeometry(0.17, 10, 8).translate(-0.45, 0.66, 0), 0xf2b8b0);
  const legs = [[0.72, -1], [0.72, 1], [-0.72, -1], [-0.72, 1]].map(([x, s]) => {
    const upper = new THREE.Group(), lower = new THREE.Group();
    upper.position.set(x, 0.86, s * 0.26);
    lower.position.y = -0.42;
    upper.add(lower);
    part(upper, new THREE.CapsuleGeometry(0.11, 0.3, 3, 10).translate(0, -0.2, 0), coat);
    part(lower, new THREE.CapsuleGeometry(0.085, 0.26, 3, 10).translate(0, -0.17, 0), coat);
    part(lower, new THREE.CylinderGeometry(0.1, 0.12, 0.14, 10).translate(0, -0.37, 0), 0x2b2420);
    body.add(upper);
    return { upper, lower, front: x > 0 };
  });
  const neck = new THREE.Group();
  neck.position.set(0.98, 1.38, 0);
  body.add(neck);
  part(neck, new THREE.CapsuleGeometry(0.24, 0.42, 3, 12).rotateZ(-0.9).translate(0.2, 0.14, 0), coat);
  part(neck, new THREE.CylinderGeometry(0.13, 0.15, 0.16, 10), 0xf2c14a, 0.36, -0.2, 0);
  const head = new THREE.Group();
  head.position.set(0.5, 0.36, 0);
  neck.add(head);
  part(head, new THREE.CapsuleGeometry(0.2, 0.3, 3, 12).rotateZ(Math.PI / 2 - 0.5).translate(0.14, -0.06, 0), patch);
  const jaw = new THREE.Group();
  jaw.position.set(0.3, -0.2, 0);
  head.add(jaw);
  part(jaw, new THREE.SphereGeometry(0.17, 10, 8).scale(1, 0.8, 1.1).translate(0.06, 0, 0), 0xf2b8b0);
  const ears: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    part(head, new THREE.ConeGeometry(0.05, 0.22, 6).rotateX(s * 0.7), 0xf4ecd8, -0.02, 0.2, s * 0.17);
    const ear = new THREE.Group();
    ear.position.set(-0.06, 0.06, s * 0.2);
    head.add(ear);
    part(ear, new THREE.SphereGeometry(0.09, 8, 6).scale(0.5, 1, 1.5).translate(0, 0, s * 0.07), coat);
    ears.push(ear);
    part(head, new THREE.SphereGeometry(0.035, 8, 6), 0x1b0f00, 0.24, 0.02, s * 0.17);
  }
  const tail = new THREE.Group(), tuft = new THREE.Group();
  tail.position.set(-1.08, 1.4, 0);
  tuft.position.y = -0.62;
  body.add(tail);
  tail.add(tuft);
  part(tail, new THREE.CapsuleGeometry(0.035, 0.6, 2, 6).translate(0, -0.32, 0), coat);
  part(tuft, new THREE.SphereGeometry(0.08, 8, 6).scale(1, 1.6, 1), 0x2b2420, 0, -0.12, 0);
  sealRig(root);
  return {
    root,
    pose(p) {
      const t = p.t ?? G.uTime.value, gz = p.graze ?? 0, w = p.walk ?? 0, walking = p.walk === undefined ? 0 : 1;
      neck.rotation.z = -gz * 1.25;
      const chew = gz > 0.5 ? Math.max(0, Math.sin(t * 6 + seed)) : 0;
      jaw.rotation.set(Math.sin(t * 3 + seed) * 0.08 * chew, 0, -0.12 * chew);
      head.rotation.z = gz * 0.3 + Math.sin(t * 0.5 + seed) * 0.04;
      ears.forEach((e, i) => { const k = fract(t / 2.9 + i * 0.4 + hash(seed)), f = k < 0.08 ? Math.sin((k / 0.08) * Math.PI) : 0; e.rotation.set((i ? 1 : -1) * (0.2 + 0.5 * f), 0, 0); });
      const swish = (p.tail ?? t * 2.2);
      tail.rotation.set(Math.sin(swish) * 0.45, 0, -0.15);
      tuft.rotation.set(Math.sin(swish - 0.9) * 0.6, 0, 0.1);
      body.scale.set(1, 1 + Math.sin(t * 1.4 + seed) * 0.006, 1 + Math.sin(t * 1.4 + seed) * 0.01);
      legs.forEach((l, i) => {
        const a = w + (i % 3 ? Math.PI : 0), sw = Math.sin(a) * 0.35 * walking, bend = Math.max(0, Math.cos(a)) * 0.55 * walking;
        l.upper.rotation.z = sw;
        l.lower.rotation.z = l.front ? bend : -bend;
      });
    },
  };
}


/**
 * A gesture curve from 0 to 1 over `dur` seconds from `t0`, acted rather than tweened: a small wind-up the other
 * way first (`anticipate`), a move that overshoots by `overshoot` and a settle. Pure in `t`, so it seeks cleanly.
 */
export function gesture(t: number, t0: number, dur: number, anticipate = 0.15, overshoot = 0.08): number {
  const u = (t - t0) / dur;
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  if (u < 0.22) return -anticipate * Math.sin((u / 0.22) * Math.PI * 0.5);
  if (u < 0.7) { const k = smooth01((u - 0.22) / 0.48); return -anticipate + (1 + overshoot + anticipate) * k; }
  return 1 + overshoot * (1 - smooth01((u - 0.7) / 0.3));
}

/** Holds a pose from `t0` to `t1`, easing in and out over `ramp` seconds: 0 outside, 1 while held. */
export const held = (t: number, t0: number, t1: number, ramp = 0.35) => Math.min(smooth01((t - t0) / ramp), 1 - smooth01((t - (t1 - ramp)) / ramp));

/** Blends two poses field by field: numbers and grip points ease from `a` to `b`; anything else is taken from `b`. */
export function mixPose(a: FigurePose, b: FigurePose, k: number): FigurePose {
  const out: FigurePose = { ...b };
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof FigurePose>) {
    const x = a[key], y = b[key];
    if (typeof x === 'number' || typeof y === 'number') (out as Record<string, unknown>)[key] = ((x as number | undefined) ?? 0) + (((y as number | undefined) ?? 0) - ((x as number | undefined) ?? 0)) * k;
    else if (x instanceof THREE.Vector3 && y instanceof THREE.Vector3) (out as Record<string, unknown>)[key] = x.clone().lerp(y, k);
    else if (x instanceof THREE.Vector3 && !y) (out as Record<string, unknown>)[key] = k < 1 ? x : undefined;
  }
  return out;
}
