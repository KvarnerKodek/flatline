import * as THREE from 'three';
import type { ActorMeta, ActorSample, DecalSample, HudSample, LabelSample, Need, Sample } from './detectors';
import type { Obb, ScreenRect, V3 } from './geom';

export type QaRole = 'actor' | 'label' | 'decal' | 'obstacle';
/** Stored in `object.userData.qa`; a bare role string is enough. */
export interface QaTag { role: QaRole; name?: string; kind?: string; maxSpeed?: number; faces?: boolean; canReverse?: boolean; group?: string; forward?: V3 }

/** Marks an object so `flatline-qa` finds it without any registry code. */
export function tagQa<T extends THREE.Object3D>(o: T, tag: QaRole | QaTag): T {
  o.userData.qa = typeof tag === 'string' ? { role: tag } : tag;
  return o;
}

export interface QaNamed { name: string; root: THREE.Object3D }
export interface QaActor extends QaNamed, Partial<Omit<QaTag, 'role' | 'name'>> {}
export interface QaBox { name: string; c: V3; h: V3; ax?: [V3, V3, V3] }
export interface Discovery { actors: Array<{ m: ActorMeta; root: THREE.Object3D }>; labels: QaNamed[]; decals: QaNamed[]; obstacles: Array<{ name: string; obb: Obb }>; hudSelectors: string[] }

export interface SourceHooks {
  actors?: () => QaActor[];
  labels?: () => QaNamed[];
  decals?: () => QaNamed[];
  obstacles?: () => QaBox[];
}

const FACING_KINDS = new Set(['person', 'animal', 'vehicle']);
const AXES: [V3, V3, V3] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

const meta = (a: QaActor): ActorMeta => {
  const kind = a.kind ?? 'actor';
  return { name: a.name, kind, group: a.group, maxSpeed: a.maxSpeed, faces: a.faces ?? FACING_KINDS.has(kind), canReverse: a.canReverse ?? false, forward: a.forward };
};

export function discover(scene: THREE.Object3D, hooks: SourceHooks = {}, hudSelectors: string[] = ['.cap', '.tag']): Discovery {
  const tagged: Record<QaRole, Array<QaNamed & Partial<QaTag>>> = { actor: [], label: [], decal: [], obstacle: [] };
  scene.traverse((o) => {
    const t = o.userData.qa as QaTag | undefined;
    if (t) tagged[t.role]?.push({ ...t, name: t.name ?? (o.name || `${t.role}#${o.id}`), root: o });
  });
  const actors = [...tagged.actor, ...(hooks.actors?.() ?? [])];
  const boxes = hooks.obstacles?.() ?? [];
  return {
    actors: actors.map((a) => ({ m: meta(a), root: a.root })),
    labels: [...tagged.label, ...(hooks.labels?.() ?? [])].map(({ name, root }) => ({ name, root })),
    decals: [...tagged.decal, ...(hooks.decals?.() ?? [])].map(({ name, root }) => ({ name, root })),
    obstacles: [...tagged.obstacle.map((o) => ({ name: o.name, box: new THREE.Box3().setFromObject(o.root) })).filter((o) => !o.box.isEmpty()).map((o) => ({ name: o.name, obb: boxObb(o.box) })), ...boxes.map((b) => ({ name: b.name, obb: { c: b.c, ax: b.ax ?? AXES, h: b.h } }))],
    hudSelectors,
  };
}

const boxObb = (b: THREE.Box3): Obb => { const c = b.getCenter(new THREE.Vector3()), h = b.getSize(new THREE.Vector3()).multiplyScalar(0.5); return { c: [c.x, c.y, c.z], ax: AXES, h: [h.x, h.y, h.z] }; };

const visible = (o: THREE.Object3D) => { for (let q: THREE.Object3D | null = o; q; q = q.parent) if (!q.visible) return false; return true; };
const v3 = (v: THREE.Vector3): V3 => [v.x, v.y, v.z];
const counts = (m: THREE.Material | THREE.Material[]) => !Array.isArray(m) && (m.blending === THREE.AdditiveBlending || m.depthWrite === false);

const inv = new THREE.Matrix4(), M = new THREE.Matrix4(), P = new THREE.Vector3();

/** Oriented box of everything solid under `root`, in the root's own axes, shrunk about its centre. */
export function obbOf(root: THREE.Object3D, shrink = 0.85): Obb | undefined {
  root.updateWorldMatrix(true, true);
  inv.copy(root.matrixWorld).invert();
  const b = new THREE.Box3();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || !visible(o) || o.userData.noQa || counts(m.material)) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    const g = m.geometry.boundingBox!;
    if (!isFinite(g.min.x)) return;
    M.multiplyMatrices(inv, o.matrixWorld);
    for (const x of [g.min.x, g.max.x]) for (const y of [g.min.y, g.max.y]) for (const z of [g.min.z, g.max.z]) b.expandByPoint(P.set(x, y, z).applyMatrix4(M));
  });
  if (b.isEmpty()) return undefined;
  const mw = root.matrixWorld, c = b.getCenter(new THREE.Vector3()), h = b.getSize(new THREE.Vector3()).multiplyScalar(0.5 * shrink);
  const ax = [0, 1, 2].map((i) => new THREE.Vector3().setFromMatrixColumn(mw, i)), sc = ax.map((a) => a.length());
  c.applyMatrix4(mw);
  return { c: v3(c), ax: ax.map((a) => v3(a.normalize())) as [V3, V3, V3], h: [h.x * sc[0], h.y * sc[1], h.z * sc[2]] };
}

const CORNERS: V3[] = [-1, 1].flatMap((x) => [-1, 1].flatMap((y) => [-1, 1].map((z): V3 => [x, y, z])));

/** Normalised-device rectangle of a box seen from `cam`; undefined when any corner is behind the camera. */
export function screenRect(o: Obb, cam: THREE.Camera): ScreenRect | undefined {
  const r: ScreenRect = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const [a, b, c] of CORNERS) {
    P.set(o.c[0], o.c[1], o.c[2]);
    for (let i = 0; i < 3; i++) P.addScaledVector(new THREE.Vector3(...o.ax[i]), o.h[i] * [a, b, c][i]);
    const w = P.clone().applyMatrix4(cam.matrixWorldInverse);
    if (w.z >= 0) return undefined;
    P.project(cam);
    r.x0 = Math.min(r.x0, P.x); r.x1 = Math.max(r.x1, P.x); r.y0 = Math.min(r.y0, P.y); r.y1 = Math.max(r.y1, P.y);
  }
  return r;
}

const onScreen = (r?: ScreenRect) => !!r && r.x1 > -1 && r.x0 < 1 && r.y1 > -1 && r.y0 < 1;
const centreInFrame = (p: V3, cam: THREE.Camera) => { const c = P.set(p[0], p[1], p[2]).project(cam); return Math.abs(c.x) < 1.1 && Math.abs(c.y) < 1.1 && c.z > -1 && c.z < 1; };
const frameArea = (r?: ScreenRect) => (r ? Math.max(0, Math.min(1, r.x1) - Math.max(-1, r.x0)) * Math.max(0, Math.min(1, r.y1) - Math.max(-1, r.y0)) / 4 : 0);

const opacityOf = (root: THREE.Object3D) => {
  let a = 0;
  root.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m && !Array.isArray(m) && (o as THREE.Mesh).isMesh && visible(o)) a = Math.max(a, m.transparent ? m.opacity : 1); });
  return a || 1;
};

export interface Env { scene: THREE.Object3D; camera: THREE.PerspectiveCamera; seek(t: number): void; canvas?: HTMLCanvasElement; hudRoot?: ParentNode }

const q = new THREE.Quaternion(), f = new THREE.Vector3(), tmp = new THREE.Vector3();

const actorSample = (a: Discovery['actors'][number], needs: Set<Need>, cam: THREE.PerspectiveCamera): ActorSample => {
  const vis = visible(a.root), obb = vis && needs.has('obb') ? obbOf(a.root) : undefined, rect = obb ? screenRect(obb, cam) : undefined;
  a.root.getWorldPosition(tmp);
  const p = v3(tmp);
  f.set(...(a.m.forward ?? [0, 0, 1])).applyQuaternion(a.root.getWorldQuaternion(q));
  const scale = a.root.getWorldScale(tmp).length();
  return { m: a.m, vis, p, fwd: v3(f), scale, opacity: vis && needs.has('fade') ? opacityOf(a.root) : 1, obb, inFrame: vis && (rect ? onScreen(rect) : centreInFrame(p, cam)), area: frameArea(rect) };
};

const hudSample = (root: ParentNode, selectors: string[]): HudSample[] => {
  const out: HudSample[] = [];
  for (const sel of selectors) root.querySelectorAll(sel).forEach((e, i) => {
    const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
    if (r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05) out.push({ name: `${sel}#${i}`, rect: { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom } });
  });
  return out;
};

const lumaOf = (gl: HTMLCanvasElement) => {
  const W = 480, H = 270, B = 16, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(gl, 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H).data;
  let blown = 0, dark = 0, n = 0;
  for (let y = 0; y < H; y += B) for (let x = 0; x < W; x += B) {
    let s = 0, mn = 1;
    for (let j = 0; j < B; j++) for (let i = 0; i < B; i++) { const k = ((y + j) * W + x + i) * 4, l = (0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2]) / 255; s += l; mn = Math.min(mn, l); }
    s /= B * B; n++;
    if (s > 0.93 && mn > 0.85) blown++;
    if (s < 0.03) dark++;
  }
  return { blown: blown / n, dark: dark / n };
};

/** Seeks to `t` and records just what `needs` asks for. */
export function sampleAt(env: Env, d: Discovery, t: number, needs: Set<Need>): Sample {
  env.seek(t);
  env.scene.updateMatrixWorld(true);
  const cam = env.camera;
  cam.updateMatrixWorld();
  const camDir = cam.getWorldDirection(new THREE.Vector3());
  const labels = needs.has('labels') ? d.labels.map(({ name, root }): LabelSample => {
    const vis = visible(root), obb = vis ? obbOf(root, 1) : undefined, rect = obb ? screenRect(obb, cam) : undefined;
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion())), to = cam.position.clone().sub(root.getWorldPosition(new THREE.Vector3())).normalize();
    return { name, vis, rect, inFrame: onScreen(rect), facing: n.dot(to) };
  }) : [];
  const decals = needs.has('decals') ? d.decals.map(({ name, root }): DecalSample => {
    const m = (root as THREE.Mesh).material as THREE.Material, b = new THREE.Box3().setFromObject(root);
    return { name, vis: visible(root), y: root.getWorldPosition(new THREE.Vector3()).y, box: { x0: b.min.x, y0: b.min.z, x1: b.max.x, y1: b.max.z }, offset: !!m?.polygonOffset, order: root.renderOrder };
  }) : [];
  return {
    t,
    cam: { p: v3(cam.position), fwd: v3(camDir), fov: cam.fov },
    actors: d.actors.map((a) => actorSample(a, needs, cam)),
    obstacles: d.obstacles,
    labels,
    decals,
    hud: needs.has('hud') && env.hudRoot ? hudSample(env.hudRoot, d.hudSelectors) : [],
    luma: needs.has('luma') && env.canvas ? lumaOf(env.canvas) : undefined,
  };
}
