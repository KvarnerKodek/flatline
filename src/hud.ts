import * as THREE from 'three';

export interface Caption { t0: number; t1: number; k: string; h: string; p?: string }
export interface Chapter { t: number; name: string }

const el = (tag: string, cls?: string, html?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

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
  private pool = new Map<string, { b: HTMLElement; tag: HTMLElement; lead: HTMLElement; w: number }>();
  private chap = el('div', 'chap');
  private v = new THREE.Vector3();
  private bar = el('div', 'bar');
  private fill = el('div', 'fill');
  private playBtn = el('button', '', 'Pause');
  pip = el('div', 'pip', '<span>Thermal</span><em>LWIR · tracking</em>');


  constructor(captions: Caption[], private chapters: Chapter[], private duration: number, onToggle: () => void, onSeek: (t: number) => void, brand?: string) {
    this.root.append(...(brand ? [el('div', 'mark', brand)] : []), this.chap, this.pip);
    this.pip.style.opacity = '0';
    for (const c of captions) {
      const e = el('div', 'cap', `<div class="k">${c.k}</div><h2>${c.h}</h2>${c.p ? `<p>${c.p}</p>` : ''}`);
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
      for (const l of labels) {
        l.style.visibility = 'visible';
        const r = l.getBoundingClientRect();
        if (r.left < edge + 8) l.style.visibility = 'hidden';
        else edge = r.right;
      }
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

  setPlaying(p: boolean) { this.playBtn.textContent = p ? 'Pause' : 'Play'; }

  update(t: number, tracks: TrackSpec[], cam: THREE.PerspectiveCamera, w: number, h: number) {
    for (const { c, e } of this.caps) {
      const a = Math.min(1, Math.max(0, Math.min((t - c.t0) / 0.9, (c.t1 - t) / 0.9)));
      e.style.opacity = String(a);
      e.style.transform = `translateY(${(1 - a) * 12}px)`;
    }
    let ch = this.chapters[0];
    for (const c of this.chapters) if (t >= c.t) ch = c;
    this.chap.textContent = ch.name;
    this.fill.style.width = (t / this.duration) * 100 + '%';

    const seen = new Set<string>();
    const placed: { x: number; y: number; w: number }[] = [];
    const TAG_H = 50;
    for (const tr of tracks) {
      seen.add(tr.id);
      let n = this.pool.get(tr.id);
      if (!n) {
        const b = el('div', 'brk', '<i></i><i></i><i></i><i></i>');
        const tag = el('div', 'tag');
        const lead = el('div', 'lead');
        this.root.append(lead, b, tag);
        n = { b, tag, lead, w: 0 };
        this.pool.set(tr.id, n);
      }
      this.v.copy(tr.pos).project(cam);
      const vis = this.v.z < 1 && this.v.z > -1 && Math.abs(this.v.x) < 1.1 && Math.abs(this.v.y) < 1.1 && tr.lock > 0.001;
      const x = (this.v.x * 0.5 + 0.5) * w, y = (-this.v.y * 0.5 + 0.5) * h;
      const sc = (1.9 - 0.9 * Math.min(1, tr.lock * 1.4)) * tr.size;
      const o = vis ? Math.min(1, tr.lock * 2.5) : 0;
      n.b.style.cssText = `--c:${tr.color};opacity:${o};transform:translate(${x}px,${y}px) scale(${sc}) rotate(${(1 - tr.lock) * 45}deg)`;
      const html = `<b>${tr.title}</b>${tr.lines.join('<br>')}`;
      if (n.tag.innerHTML !== html) { n.tag.innerHTML = html; n.w = n.tag.offsetWidth; }
      const tx = Math.min(Math.max(x + (tr.dx ?? tr.size * 46), 8), Math.max(8, w - (n.w ?? 0) - 8));
      let ty = Math.min(Math.max(y + (tr.dy ?? -tr.size * 56), 48), h * 0.62);
      const shown = o * Math.min(1, Math.max(0, (tr.lock - 0.6) * 3));
      if (shown > 0.05) {
        for (const p of placed) if (tx < p.x + p.w + 6 && p.x < tx + (n.w ?? 0) + 6 && Math.abs(ty - p.y) < TAG_H) ty = p.y + (ty >= p.y ? TAG_H : -TAG_H);
        placed.push({ x: tx, y: ty, w: n.w ?? 0 });
      }
      n.tag.style.cssText = `--c:${tr.color};opacity:${o * Math.min(1, Math.max(0, (tr.lock - 0.6) * 3))};transform:translate(${tx}px,${ty}px)`;
      const lx = tx - 4, ly = ty + 14, dx = x - lx, dy = y - ly;
      n.lead.style.cssText = `--c:${tr.color};opacity:${o * Math.min(1, Math.max(0, (tr.lock - 0.6) * 3)) * 0.8};width:${Math.hypot(dx, dy) * 0.6}px;transform:translate(${lx}px,${ly}px) rotate(${Math.atan2(dy, dx)}rad)`;
    }
    for (const [id, n] of this.pool) if (!seen.has(id)) { n.b.style.opacity = n.tag.style.opacity = n.lead.style.opacity = '0'; }
  }
}
