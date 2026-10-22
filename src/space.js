// §3 — key sizes drawn to scale: one column = 32 bytes = one Ed25519 public key.
import { SCHEMES } from './lib/schemes.js';
import { fmtInt, rngFrom, easeOut } from './lib/format.js';

export class Space {
  constructor(root, getKey) {
    this.root = root;
    this.getKey = getKey;
    this.ed = root.querySelector('[data-space-ed]');
    this.pq = root.querySelector('[data-space-pq]');
    this.scheme = 'ml-dsa-65';
    this.anim = 1;
    this.seen = false;
    root.querySelectorAll('[data-space]').forEach((b) =>
      b.addEventListener('click', () => this.set(b.dataset.space)),
    );
    new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !this.seen) {
          this.seen = true;
          this.play();
        }
      },
      { threshold: 0.35 },
    ).observe(root.querySelector('.space-figure'));
    window.addEventListener('resize', () => this.draw(1));
    this.draw(0);
  }

  set(id) {
    this.scheme = id;
    this.root.querySelectorAll('[data-space]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.space === id)));
    const s = SCHEMES[id];
    const cols = Math.ceil(s.pk / 32);
    const q = (sel) => this.root.querySelector(sel);
    q('[data-space-name]').textContent = s.name;
    q('[data-space-bytes]').textContent = `${fmtInt(s.pk)} bytes, ${cols} columns`;
    q('[data-space-th]').textContent = s.name;
    q('[data-space-pk]').textContent = `${fmtInt(s.pk)} B`;
    q('[data-space-sig]').textContent = `${fmtInt(s.sig)} B`;
    q('[data-space-sk]').textContent = `${fmtInt(s.sk)} B`;
    q('[data-space-level]').textContent = String(s.level);
    this.play();
  }

  play() {
    const t0 = performance.now();
    const dur = 1100;
    const step = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      this.draw(easeOut(t));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  bytesFor(len) {
    const key = this.getKey();
    if (key && key.publicKey.length === len) return key.publicKey;
    const rng = rngFrom(new TextEncoder().encode(this.scheme));
    return Uint8Array.from({ length: len }, () => Math.floor(rng() * 256));
  }

  draw(t) {
    const s = SCHEMES[this.scheme];
    const cols = Math.ceil(s.pk / 32);
    const rgb = getComputedStyle(document.documentElement).getPropertyValue('--cell-rgb').trim() || '226, 231, 235';
    const fig = this.root.querySelector('.space-figure');
    const avail = Math.max(200, fig.clientWidth - 80);
    const gap = 2;
    const maxCols = 81; // ML-DSA-87: size the cells so the largest scheme still fits
    const cell = Math.max(3, Math.min(9, Math.floor((avail + gap) / maxCols) - gap));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pitch = cell + gap;
    const h = 32 * pitch - gap;

    // Ed25519: one column, exposed red
    this.ed.width = Math.round(cell * dpr);
    this.ed.height = Math.round(h * dpr);
    this.ed.style.width = `${cell}px`;
    this.ed.style.height = `${h}px`;
    const e = this.ed.getContext('2d');
    e.setTransform(dpr, 0, 0, dpr, 0, 0);
    const edBytes = this.bytesFor(32);
    for (let r = 0; r < 32; r++) {
      e.fillStyle = `rgba(255,65,40,${0.25 + (edBytes[r] / 255) * 0.65})`;
      e.fillRect(0, r * pitch, cell, cell);
    }

    // PQ key
    const w = cols * pitch - gap;
    this.pq.width = Math.round(w * dpr);
    this.pq.height = Math.round(h * dpr);
    this.pq.style.width = `${w}px`;
    this.pq.style.height = `${h}px`;
    const p = this.pq.getContext('2d');
    p.setTransform(dpr, 0, 0, dpr, 0, 0);
    p.clearRect(0, 0, w, h);
    const bytes = this.bytesFor(s.pk);
    const shown = Math.floor(cols * t + 0.0001);
    for (let c = 0; c < cols; c++) {
      if (c > shown) break;
      const colFade = c === shown ? (cols * t) % 1 : 1;
      for (let r = 0; r < 32; r++) {
        const i = c * 32 + r;
        if (i >= s.pk) {
          p.strokeStyle = `rgba(${rgb},0.12)`;
          p.strokeRect(c * pitch + 0.5, r * pitch + 0.5, cell - 1, cell - 1);
          continue;
        }
        p.fillStyle = `rgba(${rgb},${(0.1 + (bytes[i] / 255) * 0.75) * colFade})`;
        p.fillRect(c * pitch, r * pitch, cell, cell);
      }
    }
  }
}
