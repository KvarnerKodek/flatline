import * as THREE from 'three';
import { G, HULL } from './toon';
import { Post } from './post';
import { Hud } from './hud';
import type { HudOptions } from './hud';
import { applyLook } from './look';
import type { Film } from './timeline';
import { Soundtrack } from './soundtrack';
import './flatline.css';

THREE.ColorManagement.enabled = false;

function ensure(id: string, tag = 'div', text?: string): HTMLElement {
  let e = document.getElementById(id);
  if (!e) {
    e = document.createElement(tag);
    e.id = id;
    if (text) e.textContent = text;
    document.body.append(e);
  }
  return e;
}

/**
 * Optional look for the page chrome. flatline's own styles stay the default; a theme only adds a class to
 * `<body>` (so a host stylesheet can scope its rules to it) and sets CSS custom properties on `:root`.
 */
export interface Theme { className?: string; vars?: Record<string, string> }
export interface PlayOptions { hud?: HudOptions; theme?: Theme; fallback?: () => void; brand?: string; base?: string }

export function applyTheme(theme?: Theme) {
  if (!theme) return;
  if (theme.className) document.body.classList.add(...theme.className.split(/\s+/).filter(Boolean));
  for (const [k, v] of Object.entries(theme.vars ?? {})) document.documentElement.style.setProperty(k, v);
}

/** Pixels drawn per frame at most, before the device pixel ratio is lowered. */
const PIXEL_BUDGET = 2.6e6;

/** Compiles every shader up front, hidden objects included, so nothing stalls the first time it appears. */
function precompile(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  const hidden: THREE.Object3D[] = [];
  scene.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
  renderer.compile(scene, camera);
  for (const o of hidden) o.visible = false;
}

export interface Player { seek(t: number): void; readonly duration: number; wav?(): string | Promise<string> }

declare global {
  interface Window { __flatline?: Player }
}

/**
 * Plays a film in the page. URL switches: `?t=40` start time, `?still` render once and stop,
 * `?cam=x,y,z,lx,ly,lz[,fov]` look from a fixed camera instead of the film's, to inspect any spot,
 * `?render` hide the controls for frame capture, `?embed` start paused and report to a parent page.
 * `window.__flatline.seek(t)` renders any instant.
 *
 * Embed protocol (same origin): the page posts {source:'flatline',type:'ready'|'ended'|'dismiss'} to its parent and
 * accepts {source:'flatline-host',type:'start'|'stop',t?}. `film.endCard` shows an overlay, then reports 'ended'.
 */
export async function play<W>(film: Film<W>, baseOrOptions: string | PlayOptions = './', fallbackArg?: () => void, brandArg?: string): Promise<Player> {
  const opts: PlayOptions = typeof baseOrOptions === 'string' ? { base: baseOrOptions, fallback: fallbackArg, brand: brandArg } : baseOrOptions;
  const base = opts.base ?? './', fallback = opts.fallback, brand = opts.brand;
  applyTheme(opts.theme);
  const q = new URLSearchParams(location.search);
  const canvas = ensure('gl', 'canvas') as HTMLCanvasElement;
  ensure('hud'); ensure('ui'); ensure('boot', 'div', 'Loading');
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  } catch {
    fallback?.();
    throw new Error('WebGL is unavailable');
  }
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 22000);
  const world = await film.load(base);
  const scene = film.scene(world);
  if (film.look) applyLook(film.look);
  if (film.look?.edges && !film.look.edges.hulls) scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m && !Array.isArray(m) && m.userData[HULL]) o.visible = false; });
  const post = new Post(renderer, scene, camera, { ...film.look?.grade, ...film.grade }, { edges: film.look?.edges, haze: film.look?.haze });
  const render3d = q.has('render');
  const embed = q.has('embed');
  if (render3d) document.body.classList.add('render');
  if (embed) document.body.classList.add('embed');
  if (film.letterbox) {
    document.body.classList.add('letterbox');
    document.body.style.setProperty('--lb', String(film.letterbox));
  }

  let W = innerWidth, Hh = innerHeight;
  // Resolution is chosen once from a pixel budget so it never changes visibly mid-shot.
  const budgetDpr = () => (render3d ? devicePixelRatio || 1 : Math.max(1, Math.min(devicePixelRatio || 1, 2, Math.sqrt(PIXEL_BUDGET / (W * Hh)))));
  let dprCap = budgetDpr();
  const applySize = () => {
    renderer.setPixelRatio(dprCap);
    renderer.setSize(W, Hh, false);
    post.setSize(W, Hh, dprCap);
    G.uRes.value.set(W * dprCap, Hh * dprCap);
    camera.aspect = W / Hh;
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', () => { W = innerWidth; Hh = innerHeight; dprCap = budgetDpr(); applySize(); });
  applySize();

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let t = parseFloat(q.get('t') ?? (reduced ? String(film.duration * 0.4) : '0'));
  let playing = !reduced && !q.has('still') && !embed;
  const toggle = () => { if (t >= film.duration) t = 0; playing = !playing; hud.setPlaying(playing); };
  const hud = new Hud(film.captions, film.chapters, film.duration, toggle, (s) => { t = s; }, brand, opts.hud);
  const sound = film.sound?.() ?? (film.score ? new Soundtrack(film.score()) : undefined);
  if (sound && !render3d) setTimeout(() => sound.prepare(), 1500);
  if (sound && !render3d) hud.button('Sound off', (b) => {
    b.textContent = sound.on ? 'Sound off' : 'Tuning';
    sound.enable(!sound.on, () => { b.textContent = 'Sound on'; });
  });
  hud.setPlaying(playing);
  const say = (type: string) => { if (embed) parent.postMessage({ source: 'flatline', type }, location.origin); };
  let card: HTMLElement | undefined, announced = false;
  if (film.endCard) {
    card = document.createElement('div');
    card.className = 'endcard';
    card.innerHTML = film.endCard.html;
    document.body.append(card);
  }
  addEventListener('message', (e) => {
    if (e.origin !== location.origin || e.data?.source !== 'flatline-host') return;
    if (e.data.type === 'start') { t = typeof e.data.t === 'number' ? e.data.t : 0; announced = false; playing = true; hud.setPlaying(true); }
    if (e.data.type === 'stop') { playing = false; hud.setPlaying(false); }
  });
  addEventListener('keydown', (e) => {
    if (e.code === 'Escape') say('dismiss');
    if (e.code === 'Space') { e.preventDefault(); toggle(); }
    else if (e.code === 'ArrowRight') t = Math.min(film.duration, t + 5);
    else if (e.code === 'ArrowLeft') t = Math.max(0, t - 5);
    else if (e.code === 'KeyR') { t = 0; playing = true; hud.setPlaying(true); }
  });

  const follow = film.follow?.(world) ?? [], sun = film.sun?.(world);
  const inspect = q.get('cam')?.split(',').map(Number);
  if (inspect) document.body.classList.add('inspect');
  const render = (now: number) => {
    G.uTime.value = film.warp ? film.warp(t) : t;
    const f = film.frame(world, film.warp ? film.warp(t) : t);
    if (inspect) { f.cam.p.set(inspect[0], inspect[1], inspect[2]); f.cam.look.set(inspect[3], inspect[4], inspect[5]); if (inspect[6]) f.cam.fov = inspect[6]; }
    camera.position.copy(f.cam.p);
    camera.lookAt(f.cam.look);
    const wide = Math.min(1.7, Math.max(1, 1 + (1.2 - camera.aspect) * 1.1));
    const fov = f.cam.fov * wide;
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
    for (const o of follow) o.position.set(camera.position.x, o.userData.followY ?? camera.position.y, camera.position.z);
    hud.update(t, f.tracks, camera, W, Hh);
    scene.updateMatrixWorld();
    sun?.render(renderer, scene);
    post.render(t, f.fade, f.night, f.flash ?? 0);
    if (card && film.endCard) {
      const ca = Math.min(1, Math.max(0, (t - film.endCard.at + 1.2) / 1.8));
      card.style.opacity = String(ca);
      card.style.pointerEvents = ca > 0.5 ? 'auto' : 'none';
      document.body.classList.toggle('ended', ca > 0.05);
      if (ca >= 1 && !announced) { announced = true; say('ended'); }
    }
    film.afterPost?.(world, t, { renderer, camera, width: W, height: Hh, hud });
  };

  const player: Player = { seek: (s) => { t = s; render(performance.now()); }, duration: film.duration, wav: sound && (() => sound.wavBase64()) };
  window.__flatline = player;
  precompile(renderer, scene, camera);
  render(performance.now());
  document.getElementById('boot')?.remove();
  document.title = 'ready';
  say('ready');

  let last = performance.now(), slow = 0, frames = 0;
  const adapt = (dt: number) => {
    if (render3d || !playing) return;
    slow = Math.max(0, Math.min(90, slow + (dt > 0.026 ? 1 : -1)));
    if (++frames % 90 === 0 && slow > 60 && dprCap > 1) { dprCap = Math.max(1, dprCap - 0.25); applySize(); slow = 0; }
  };
  if (!q.has('still')) {
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      adapt(dt);
      if (playing && !document.hidden) {
        t += dt;
        if (sound) t = sound.sync(t, playing);
        if (t >= film.duration) { t = film.duration; playing = false; hud.setPlaying(false); }
      } else if (sound) {
        sound.sync(t, false);
      }
      render(now);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  return player;
}
