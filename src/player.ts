import * as THREE from 'three';
import { G } from './toon';
import { Post } from './post';
import { Hud } from './hud';
import type { Film } from './timeline';
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

export interface Player { seek(t: number): void; readonly duration: number }

declare global {
  interface Window { __flatline?: Player }
}

/**
 * Plays a film in the page. URL switches: `?t=40` start time, `?still` render once and stop,
 * `?render` hide the controls for frame capture, `?embed` start paused and report to a parent page.
 * `window.__flatline.seek(t)` renders any instant.
 *
 * Embed protocol (same origin): the page posts {source:'flatline',type:'ready'|'ended'|'dismiss'} to its parent and
 * accepts {source:'flatline-host',type:'start'|'stop',t?}. `film.endCard` shows an overlay, then reports 'ended'.
 */
export async function play<W>(film: Film<W>, base = './', fallback?: () => void, brand?: string): Promise<Player> {
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
  const post = new Post(renderer, scene, camera);
  const render3d = q.has('render');
  const embed = q.has('embed');
  if (render3d) document.body.classList.add('render');
  if (embed) document.body.classList.add('embed');

  let W = innerWidth, Hh = innerHeight;
  let dprCap = Math.min(devicePixelRatio || 1, W < 800 ? 1.5 : 2);
  const applySize = () => {
    renderer.setPixelRatio(dprCap);
    renderer.setSize(W, Hh, false);
    post.setSize(W, Hh, dprCap);
    G.uRes.value.set(W * dprCap, Hh * dprCap);
    camera.aspect = W / Hh;
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', () => { W = innerWidth; Hh = innerHeight; applySize(); });
  applySize();

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let t = parseFloat(q.get('t') ?? (reduced ? String(film.duration * 0.4) : '0'));
  let playing = !reduced && !q.has('still') && !embed;
  const toggle = () => { if (t >= film.duration) t = 0; playing = !playing; hud.setPlaying(playing); };
  const hud = new Hud(film.captions, film.chapters, film.duration, toggle, (s) => { t = s; }, brand);
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

  const follow = film.follow?.(world) ?? [];
  const render = (now: number) => {
    G.uTime.value = film.warp ? film.warp(t) : t;
    const f = film.frame(world, film.warp ? film.warp(t) : t);
    camera.position.copy(f.cam.p);
    camera.lookAt(f.cam.look);
    const wide = Math.min(1.7, Math.max(1, 1 + (1.2 - camera.aspect) * 1.1));
    const fov = f.cam.fov * wide;
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
    for (const o of follow) o.position.set(camera.position.x, o.userData.followY ?? camera.position.y, camera.position.z);
    hud.update(t, f.tracks, camera, W, Hh);
    post.render(now / 1000, f.fade, f.night);
    if (card && film.endCard) {
      const ca = Math.min(1, Math.max(0, (t - film.endCard.at + 1.2) / 1.8));
      card.style.opacity = String(ca);
      card.style.pointerEvents = ca > 0.5 ? 'auto' : 'none';
      document.body.classList.toggle('ended', ca > 0.05);
      if (ca >= 1 && !announced) { announced = true; say('ended'); }
    }
    film.afterPost?.(world, t, { renderer, camera, width: W, height: Hh, hud });
  };

  const player: Player = { seek: (s) => { t = s; render(performance.now()); }, duration: film.duration };
  window.__flatline = player;
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
        if (t >= film.duration) { t = film.duration; playing = false; hud.setPlaying(false); }
      }
      render(now);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  return player;
}
