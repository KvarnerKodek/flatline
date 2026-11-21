import * as THREE from 'three';
import { ss } from './timeline';

/** `cls` adds a style: `title` centres the caption as a title card, `quiet` shows only the small line. */
export interface Caption { t0: number; t1: number; k: string; h: string; p?: string; cls?: string }
export interface Chapter { t: number; name: string }

const el = (tag: string, cls?: string, html?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

/** How tracked objects are marked: lock-on corner brackets with a leader line (the original), or just the tag. */
export interface HudOptions {
  markers?: 'brackets' | 'none';
  /** Vertical distance in pixels between tags that overlap; default 50. */
  tagStep?: number;
  /** Lowest a tag may sit, as a fraction of the viewport height; default 0.55. */
  tagReach?: number;
}

export interface TagBox { x: number; y: number; w: number }

/** Moves a tag at (`x`, `y`) of width `w` away from every placed tag it overlaps horizontally, a `step` at a time, in the direction it already leans. */
export function clearTag(placed: TagBox[], x: number, y: number, w: number, step = 50): number {
  for (const p of placed) if (x < p.x + p.w + 6 && p.x < x + w + 6 && Math.abs(y - p.y) < step) y = p.y + (y >= p.y ? step : -step);
  return y;
}

export interface Rect { x: number; y: number; w: number; h: number }

/** Opacity and upward slide of a caption at `t`: eased in and out over `fade` seconds, a pure function of time. */
export function captionPose({ t0, t1 }: Pick<Caption, 't0' | 't1'>, t: number, fade = 0.9) {
  const a = ss(0, 1, Math.min((t - t0) / fade, (t1 - t) / fade));
  return { a, dy: (1 - a) * 12 };
}

/** The line from the tag edge nearest `target` to a `gap` short of it: start, length and angle (radians). */
export function leaderSegment(tag: Rect, target: { x: number; y: number }, gap = 0) {
  const x = Math.min(Math.max(target.x, tag.x), tag.x + tag.w), y = Math.min(Math.max(target.y, tag.y), tag.y + tag.h);
  const dx = target.x - x, dy = target.y - y;
  return { x, y, len: Math.max(0, Math.hypot(dx, dy) - gap), angle: Math.atan2(dy, dx) };
}

/** Moves a tag of size `w` by `h` at (`x`, `y`) above or below every region it covers, whichever is nearer, with a 6px margin. */
export function avoidRects(regions: Rect[], x: number, y: number, w: number, h: number): number {
  for (const r of regions) {
    if (x >= r.x + r.w || r.x >= x + w || y >= r.y + r.h || r.y >= y + h) continue;
    const up = r.y - h - 6, down = r.y + r.h + 6;
    y = Math.abs(y - up) <= Math.abs(y - down) ? up : down;
  }
  return y;
}

/** Keeps a tag of height `h` between `min` and the bottom of a viewport `vh` tall, 8px in. */
export const clampTag = (y: number, h: number, vh: number, min = 8) => Math.max(min, Math.min(y, vh - h - 8));

/** Left edge of a seekbar chapter label: starts at its tick and stays inside the bar. */
export const chapterLabelLeft = (tickPx: number, labelW: number, scrubW: number) => Math.max(0, Math.min(tickPx, scrubW - labelW));

export interface TrackSpec {
  id: string;
  pos: THREE.Vector3;
  color: string;
  title: string;
  lines: string[];
  lock: number;
  size: number;
  dx?: number;
  dy?: number;
}

export class Hud {
  root = document.getElementById('hud')!;
  ui = document.getElementById('ui')!;
  private caps: { c: Caption; e: HTMLElement }[] = [];
  private pool = new Map<string, { b: HTMLElement; tag: HTMLElement; lead: HTMLElement; w: number; h: number }>();
  private chap = el('div', 'chap');
  private v = new THREE.Vector3();
  private bar = el('div', 'bar');
  private fill = el('div', 'fill');
  private playBtn = el('button', '', 'Pause');
  pip = el('div', 'pip', '<span>Thermal</span><em>LWIR · tracking</em>');


  constructor(captions: Caption[], private chapters: Chapter[], private duration: number, onToggle: () => void, onSeek: (t: number) => void, brand?: string, private opts: HudOptions = {}) {
    if (opts.markers === 'none') this.root.classList.add('nomarkers');
    this.root.append(...(brand ? [el('div', 'mark', brand)] : []), this.chap, this.pip);
    this.pip.style.opacity = '0';
    for (const c of captions) {
      const e = el('div', c.cls ? `cap ${c.cls}` : 'cap', `<div class="k">${c.k}</div><h2>${c.h}</h2>${c.p ? `<p>${c.p}</p>` : ''}`);
      e.style.opacity = '0';
      this.root.append(e);
      this.caps.push({ c, e });
    }

    const scrub = el('div', 'scrub');
    scrub.append(this.fill);
    for (const ch of chapters) {
      const x = (ch.t / duration) * 100;
      const tick = el('div', 'tick');
      tick.style.left = x + '%';
      const tl = el('div', 'tl', ch.name);
      tl.style.left = x + '%';
      scrub.append(tick, tl);
    }
    const labels = [...scrub.querySelectorAll<HTMLElement>('.tl')];
    const declutter = () => {
      let edge = -Infinity;
      labels.forEach((l, i) => {
        l.style.visibility = 'visible';
        l.style.left = chapterLabelLeft((chapters[i].t / duration) * scrub.clientWidth, l.offsetWidth, scrub.clientWidth) + 'px';
        const r = l.getBoundingClientRect();
        if (r.left < edge + 8) l.style.visibility = 'hidden';
        else edge = r.right;
      });
    };
    addEventListener('resize', declutter);
    requestAnimationFrame(declutter);
    const seekFrom = (ev: PointerEvent) => {
      const r = scrub.getBoundingClientRect();
      onSeek(Math.min(0.999, Math.max(0, (ev.clientX - r.left) / r.width)) * duration);
    };
    let drag = false;
    scrub.addEventListener('pointerdown', (e) => { drag = true; scrub.setPointerCapture(e.pointerId); seekFrom(e); });
    scrub.addEventListener('pointermove', (e) => { if (drag) seekFrom(e); });
    scrub.addEventListener('pointerup', () => { drag = false; });
    this.playBtn.addEventListener('click', onToggle);
    this.bar.append(this.playBtn, scrub);
    this.ui.append(this.bar);
    let idle: number | undefined;
    const wake = () => { this.bar.classList.remove('idle'); clearTimeout(idle); idle = window.setTimeout(() => this.bar.classList.add('idle'), 3200); };
    addEventListener('pointermove', wake);
    addEventListener('keydown', wake);
    wake();
  }

  setPlaying(p: boolean) { this.playBtn.textContent = p ? 'Pause' : 'Play'; this.playBtn.classList.toggle('playing', p); this.playBtn.setAttribute('aria-label', p ? 'Pause' : 'Play'); }

  /** Adds a button to the control bar, after Play. */
  button(label: string, onClick: (b: HTMLElement) => void): HTMLElement {
    const b = el('button', '', label);
    b.addEventListener('click', () => onClick(b));
    this.playBtn.after(b);
    return b;
  }

  update(t: number, tracks: TrackSpec[], cam: THREE.PerspectiveCamera, w: number, h: number) {
    for (const { c, e } of this.caps) {
      const { a, dy } = captionPose(c, t);
      e.style.opacity = String(a);
      e.style.transform = `translateY(${dy.toFixed(2)}px)`;
    }
    let ch = this.chapters[0];
    for (const c of this.chapters) if (t >= c.t) ch = c;
    this.chap.textContent = ch.name;
    this.fill.style.width = (t / this.duration) * 100 + '%';

    const seen = new Set<string>();
    const placed: TagBox[] = [], keep: Rect[] = [];
    const { tagStep = 50, tagReach = 0.55 } = this.opts;
    const marked = this.opts.markers !== 'none';
    const shown = tracks.map((tr) => {
      this.v.copy(tr.pos).project(cam);
      const vis = this.v.z < 1 && this.v.z > -1 && Math.abs(this.v.x) < 1.1 && Math.abs(this.v.y) < 1.1 && tr.lock > 0.001;
      const x = (this.v.x * 0.5 + 0.5) * w, y = (-this.v.y * 0.5 + 0.5) * h;
      const sc = (1.9 - 0.9 * Math.min(1, tr.lock * 1.4)) * tr.size;
      const o = vis ? Math.min(1, tr.lock * 2.5) : 0;
      if (o > 0.05 && marked) keep.push({ x: x - 32 * sc, y: y - 32 * sc, w: 64 * sc, h: 64 * sc });
      return { tr, x, y, sc, o };
    });
    for (const { tr, x, y, sc, o } of shown) {
      seen.add(tr.id);
      let n = this.pool.get(tr.id);
      if (!n) {
        const b = el('div', 'brk', '<i></i><i></i><i></i><i></i>');
        const tag = el('div', 'tag');
        const lead = el('div', 'lead');
        this.root.append(lead, b, tag);
        n = { b, tag, lead, w: 0, h: 0 };
        this.pool.set(tr.id, n);
      }
      n.b.style.cssText = `--c:${tr.color};opacity:${o};transform:translate(${x}px,${y}px) scale(${sc}) rotate(${(1 - tr.lock) * 45}deg)`;
      const html = `<b>${tr.title}</b>${tr.lines.join('<br>')}`;
      if (n.tag.innerHTML !== html) { n.tag.innerHTML = html; n.w = n.tag.offsetWidth; n.h = n.tag.offsetHeight; }
      const tx = Math.round(Math.min(Math.max(x + (tr.dx ?? tr.size * 46), 8), Math.max(8, w - n.w - 8)));
      let ty = Math.min(Math.max(y + (tr.dy ?? -tr.size * 56), Math.min(116, h * 0.2)), h * tagReach);
      const a = o * Math.min(1, Math.max(0, (tr.lock - 0.6) * 3));
      if (a > 0.05) {
        ty = clearTag(placed, tx, avoidRects(keep, tx, ty, n.w, n.h), n.w, Math.max(tagStep, n.h + 6));
        placed.push({ x: tx, y: ty, w: n.w });
      }
      ty = Math.round(clampTag(ty, n.h, h, Math.min(116, h * 0.2)));
      n.tag.style.cssText = `--c:${tr.color};opacity:${a};transform:translate(${tx}px,${ty}px)`;
      const l = leaderSegment({ x: tx, y: ty, w: n.w, h: n.h }, { x, y }, marked ? 22 * sc : 4);
      n.lead.style.cssText = `--c:${tr.color};opacity:${a * 0.85};width:${l.len.toFixed(1)}px;transform:translate(${l.x}px,${l.y}px) rotate(${l.angle}rad)`;
    }
    for (const [id, n] of this.pool) if (!seen.has(id)) { n.b.style.opacity = n.tag.style.opacity = n.lead.style.opacity = '0'; }
  }
}
