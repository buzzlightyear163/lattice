// §1 — a pinned scroll sequence drawn on canvas.
// 1.1 address → 32 bytes (each byte shown as its 8 bits)
// 1.2 bytes → points on a twisted Edwards curve (illustrated over a small field), forward walk B → A
// 1.3 Shor walks it back (red)
// 1.4 points settle into a 2-D lattice: closest-vector search with no shortcut
import { b58decode, b58encode } from './lib/base58.js';
import { clamp, smooth, easeInOut, lerp } from './lib/format.js';

const N = 288;
const P = 307; // small prime for the illustration
const SAMPLE_BYTES = new Uint8Array([
  0x63, 0x1f, 0xa2, 0x0c, 0x9e, 0x47, 0xd1, 0x38, 0x5b, 0xe6, 0x02, 0x7a, 0xc4, 0x19, 0x8f, 0xb3,
  0x2d, 0x71, 0xee, 0x40, 0x96, 0x0b, 0xcf, 0x54, 0x88, 0x3a, 0xf7, 0x11, 0x6c, 0xa9, 0x25, 0xd8,
]);

function curvePoints() {
  // -x² + y² = 1 + d·x²·y²  (mod P)  →  y² = (1 + x²) / (1 - d·x²)
  const d = 121; // any non-square-ish constant, illustration only
  const mod = (a) => ((a % P) + P) % P;
  const pow = (b, e) => { let r = 1; b = mod(b); while (e > 0) { if (e & 1) r = (r * b) % P; b = (b * b) % P; e >>= 1; } return r; };
  const inv = (a) => pow(a, P - 2);
  const sqrts = new Map();
  for (let y = 0; y < P; y++) { const s = (y * y) % P; if (!sqrts.has(s)) sqrts.set(s, []); sqrts.get(s).push(y); }
  const pts = [];
  for (let x = 0; x < P; x++) {
    const den = mod(1 - d * x * x);
    if (!den) continue;
    const y2 = mod((1 + x * x) * inv(den));
    for (const y of sqrts.get(y2) || []) pts.push([x / (P - 1), y / (P - 1)]);
  }
  return pts;
}

export class Sequence {
  constructor(section, onStep) {
    this.section = section;
    this.canvas = section.querySelector('[data-seq-canvas]');
    this.ctx = this.canvas.getContext('2d');
    this.onStep = onStep;
    this.step = -1;
    this.visible = false;
    this.bytes = SAMPLE_BYTES;
    this.address = b58encode(SAMPLE_BYTES);
    const cp = curvePoints();
    // deterministic shuffle so neighbours in the byte grid scatter across the curve
    let s = 12345;
    const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = cp.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cp[i], cp[j]] = [cp[j], cp[i]]; }
    this.curve = Array.from({ length: N }, (_, i) => cp[i % cp.length]);
    this.delay = Array.from({ length: N }, () => rnd() * 0.45);
    this.iB = 17;
    this.iA = 203;
    this.walk = [this.iB];
    for (let k = 0; k < 6; k++) this.walk.push(Math.floor(rnd() * N));
    this.walk.push(this.iA);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    new IntersectionObserver(([e]) => {
      this.visible = e.isIntersecting;
      if (this.visible) this.tick();
    }).observe(section);
    this.tick = this.tick.bind(this);
  }

  setAddress(address) {
    const b = b58decode(address);
    if (b && b.length === 32) {
      this.bytes = b;
      this.address = address;
    }
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.dpr = dpr;
    this.W = r.width;
    this.H = r.height;
    const mobile = r.width < 980;
    if (mobile) {
      const S = Math.min(r.width * 0.9, r.height * 0.5);
      this.region = { cx: r.width / 2, cy: 72 + S / 2, S };
    } else {
      const left = Math.max(r.width * 0.44, (r.width - 1440) / 2 + 560);
      const w = r.width - left - Math.max(24, (r.width - 1440) / 2);
      const S = Math.min(w * 0.92, r.height * 0.74);
      this.region = { cx: left + w / 2, cy: r.height / 2 + 24, S };
    }
    this.layout();
  }

  layout() {
    const { cx, cy, S } = this.region;
    // stage 0: 8×4 byte cells, 3×3 dots per cell (8 bits + centre marker)
    const pitch = (S * 0.94) / 8;
    const inner = pitch * 0.5;
    const gx = cx - (pitch * 8) / 2 + pitch / 2;
    const vpitch = pitch * 1.22;
    const gy = cy - (vpitch * 4) / 2 + vpitch / 2 + S * 0.04;
    this.cells = [];
    this.s0 = [];
    for (let c = 0; c < 32; c++) {
      const col = c % 8, row = Math.floor(c / 8);
      const x = gx + col * pitch, y = gy + row * vpitch;
      this.cells.push({ x, y, pitch, inner });
      for (let k = 0; k < 9; k++) {
        const kx = (k % 3) - 1, ky = Math.floor(k / 3) - 1;
        this.s0.push([x + kx * inner * 0.5, y + ky * inner * 0.5]);
      }
    }
    // stage 1/2: curve points in a square
    const side = S * 0.84;
    this.frame = { x: cx - side / 2, y: cy - side / 2, side };
    this.s1 = this.curve.map(([u, v]) => [cx - side / 2 + u * side, cy + side / 2 - v * side]);
    // stage 3: 2-D lattice
    const a = S / 18;
    this.b1 = [a, a * 0.22];
    this.b2 = [a * 0.38, -a];
    const pts = [];
    for (let i = -16; i <= 16; i++) for (let j = -16; j <= 16; j++) {
      const x = cx + i * this.b1[0] + j * this.b2[0];
      const y = cy + i * this.b1[1] + j * this.b2[1];
      const d = Math.hypot(x - cx, y - cy);
      if (d < S * 0.46) pts.push([x, y, d]);
    }
    pts.sort((p, q) => p[2] - q[2]);
    this.s3 = Array.from({ length: N }, (_, i) => pts[i % pts.length]);
    this.origin = [cx, cy];
    const tx = cx + 3.37 * this.b1[0] + 2.61 * this.b2[0];
    const ty = cy + 3.37 * this.b1[1] + 2.61 * this.b2[1];
    this.target = [tx, ty];
    this.near = pts.map((p) => [p[0], p[1], Math.hypot(p[0] - tx, p[1] - ty)]).sort((p, q) => p[2] - q[2]).slice(0, 5);
  }

  progress() {
    const r = this.section.getBoundingClientRect();
    const total = r.height - innerHeight;
    return clamp(-r.top / total, 0, 1);
  }

  tick() {
    if (!this.visible) return;
    requestAnimationFrame(this.tick);
    this.draw(performance.now() / 1000);
  }

  draw(time) {
    const ctx = this.ctx;
    const dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    const raw = this.progress() * 4;
    const active = raw < 1.1 ? 0 : raw < 2.05 ? 1 : raw < 3.05 ? 2 : 3;
    if (active !== this.step) {
      this.step = active;
      this.onStep && this.onStep(active);
    }
    const { S } = this.region;
    const mono = (px) => `${px}px 'Fragment Mono', ui-monospace, monospace`;

    // overlay weights
    const wBytes = 1 - smooth(1.0, 1.22, raw);
    const wCurve = smooth(1.12, 1.4, raw) * (1 - smooth(2.95, 3.15, raw));
    const walkP = smooth(1.35, 1.9, raw);
    const shorP = smooth(2.1, 2.5, raw);
    const wShor = smooth(2.08, 2.2, raw) * (1 - smooth(2.95, 3.12, raw));
    const wLat = smooth(3.3, 3.6, raw);

    // ---- stage 0 overlays: address + hex labels
    if (wBytes > 0.01) {
      ctx.globalAlpha = wBytes;
      ctx.fillStyle = '#E2E7EB';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const c0 = this.cells[0];
      const fs = clamp(S * 0.026, 10, 15);
      ctx.font = mono(fs);
      ctx.fillText(this.address, this.region.cx, c0.y - c0.pitch * 1.25);
      ctx.fillStyle = '#5B646C';
      ctx.font = mono(clamp(S * 0.018, 9, 11));
      ctx.fillText('base58  →  32 bytes  →  256 bits', this.region.cx, c0.y - c0.pitch * 0.82);
      ctx.font = mono(clamp(S * 0.019, 9, 12));
      for (let c = 0; c < 32; c++) {
        const cell = this.cells[c];
        ctx.strokeStyle = 'rgba(226,231,235,0.12)';
        ctx.lineWidth = 1;
        const h = cell.inner * 0.78;
        ctx.strokeRect(cell.x - h, cell.y - h, h * 2, h * 2);
        ctx.fillStyle = '#8E979F';
        ctx.fillText(this.bytes[c].toString(16).padStart(2, '0'), cell.x, cell.y + cell.inner * 1.32);
      }
      ctx.globalAlpha = 1;
    }

    // ---- stage 1/2 overlays: frame, label
    if (wCurve > 0.01) {
      const f = this.frame;
      ctx.globalAlpha = wCurve;
      ctx.strokeStyle = 'rgba(226,231,235,0.12)';
      ctx.lineWidth = 1;
      ctx.strokeRect(f.x, f.y, f.side, f.side);
      ctx.fillStyle = '#5B646C';
      ctx.font = mono(clamp(S * 0.018, 9, 11));
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`−x² + y² = 1 + d·x²y²   over a ${P}-element field (illustration)`, f.x, f.y + f.side + 10);
      ctx.globalAlpha = 1;
    }

    // ---- particle positions
    const m01 = raw < 1 ? 0 : raw < 2 ? 1 : 1; // used per particle below
    const pos = new Array(N);
    for (let i = 0; i < N; i++) {
      let x, y;
      if (raw < 1) {
        [x, y] = this.s0[i];
      } else if (raw < 3) {
        const t = easeInOut(clamp((raw - 1 - this.delay[i] * 0.3) / 0.42, 0, 1));
        x = lerp(this.s0[i][0], this.s1[i][0], t);
        y = lerp(this.s0[i][1], this.s1[i][1], t);
      } else {
        const t = easeInOut(clamp((raw - 3 - this.delay[i] * 0.3) / 0.42, 0, 1));
        x = lerp(this.s1[i][0], this.s3[i][0], t);
        y = lerp(this.s1[i][1], this.s3[i][1], t);
      }
      pos[i] = [x, y];
    }
    void m01;

    // forward walk B → A
    if (wCurve > 0.01 && walkP > 0) {
      this.path(ctx, this.walk.map((i) => pos[i]), walkP, `rgba(226,231,235,${0.38 * wCurve})`, 1);
    }
    // Shor: A → B in red
    if (wShor > 0.01 && shorP > 0) {
      const back = this.walk.slice().reverse().map((i) => pos[i]);
      this.path(ctx, [back[0], back[back.length - 1]], shorP, `rgba(255,65,40,${0.95 * wShor})`, 1.6, true);
    }

    // particles
    for (let i = 0; i < N; i++) {
      const [x, y] = pos[i];
      let a = 0.85, r = 1.7;
      if (raw < 1.3) {
        const c = Math.floor(i / 9), k = i % 9;
        if (k === 4) { a = 0.18; }
        else {
          const bit = k < 4 ? k : k - 1;
          const on = (this.bytes[c] >> (7 - bit)) & 1;
          a = on ? 0.95 : 0.2;
        }
        r = 1.8;
        a = lerp(a, 0.8, smooth(1.0, 1.3, raw));
      }
      if (wShor > 0) a *= 1 - 0.45 * wShor;
      ctx.fillStyle = `rgba(226,231,235,${a})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // labels B, A
    if (wCurve > 0.01) {
      ctx.globalAlpha = wCurve;
      this.label(ctx, pos[this.iB], 'B', '#E2E7EB');
      this.label(ctx, pos[this.iA], wShor > 0.3 ? 'A' : 'A = a · B', '#E2E7EB');
      ctx.globalAlpha = 1;
    }
    if (wShor > 0.01) {
      ctx.globalAlpha = wShor * smooth(2.35, 2.55, raw);
      const [bx, by] = pos[this.iB];
      ctx.fillStyle = '#FF4128';
      ctx.font = mono(clamp(S * 0.024, 11, 14));
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      // the secret itself stays redacted: this is an illustration, not anyone's key
      const ty0 = by + 26;
      const w0 = ctx.measureText('a = ').width;
      const barW = clamp(S * 0.14, 56, 96);
      const total = w0 + barW + 10 + ctx.measureText('recovered').width;
      const x0 = bx + 14 + total > this.frame.x + this.frame.side ? bx - 14 - total : bx + 14;
      ctx.fillText('a =', x0, ty0);
      ctx.fillRect(x0 + w0, ty0 - 6, barW, 12);
      ctx.fillText('recovered', x0 + w0 + barW + 10, ty0);
      ctx.globalAlpha = 1;
    }

    // ---- stage 3 overlays: basis vectors, target, search
    if (wLat > 0.01) {
      ctx.globalAlpha = wLat;
      const [ox, oy] = this.origin;
      this.arrow(ctx, ox, oy, ox + this.b1[0] * 2, oy + this.b1[1] * 2, 'b₁');
      this.arrow(ctx, ox, oy, ox + this.b2[0] * 2, oy + this.b2[1] * 2, 'b₂');
      const [tx, ty] = this.target;
      const k = Math.floor(time * 1.6) % this.near.length;
      this.near.forEach(([x, y], i) => {
        ctx.setLineDash([2, 4]);
        ctx.strokeStyle = `rgba(226,231,235,${i === k ? 0.55 : 0.16})`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke();
        ctx.setLineDash([]);
      });
      ctx.strokeStyle = '#E2E7EB';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(tx, ty, 6, 0, Math.PI * 2); ctx.stroke();
      ctx.font = "italic 20px 'Instrument Serif', serif";
      ctx.fillStyle = '#E2E7EB';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('t', tx + 12, ty - 10);
      ctx.fillStyle = '#5B646C';
      ctx.font = mono(clamp(S * 0.018, 9, 11));
      ctx.textBaseline = 'top';
      ctx.fillText('a 2-D lattice (illustration). ML-DSA-65 works in (k + l)·n = 2,816 dimensions', this.frame.x, this.frame.y + this.frame.side + 10);
      ctx.globalAlpha = 1;
    }
  }

  path(ctx, pts, prog, color, width, arrowHead = false) {
    if (pts.length < 2) return;
    const seg = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      seg.push(l);
      total += l;
    }
    let left = total * prog;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    let end = pts[0];
    for (let i = 1; i < pts.length && left > 0; i++) {
      const t = Math.min(1, left / seg[i - 1]);
      end = [lerp(pts[i - 1][0], pts[i][0], t), lerp(pts[i - 1][1], pts[i][1], t)];
      ctx.lineTo(end[0], end[1]);
      left -= seg[i - 1];
    }
    ctx.stroke();
    if (arrowHead || prog < 1) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(end[0], end[1], arrowHead ? 3.5 : 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  arrow(ctx, x0, y0, x1, y1, label) {
    ctx.strokeStyle = '#E2E7EB';
    ctx.fillStyle = '#E2E7EB';
    ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    const a = Math.atan2(y1 - y0, x1 - x0);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - 8 * Math.cos(a - 0.4), y1 - 8 * Math.sin(a - 0.4));
    ctx.lineTo(x1 - 8 * Math.cos(a + 0.4), y1 - 8 * Math.sin(a + 0.4));
    ctx.closePath();
    ctx.fill();
    ctx.font = "italic 19px 'Instrument Serif', serif";
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x1 + 8, y1 - 8);
  }

  label(ctx, [x, y], text, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(x, y, 6.5, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = "italic 21px 'Instrument Serif', serif";
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 13, y - 12);
  }
}
