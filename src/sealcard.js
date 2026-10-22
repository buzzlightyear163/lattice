// Renders the shareable seal card (1200×675) on a canvas. Three modes:
// specimen (sample), exposed (after a scan), sealed (after forging).
import { interferenceCss } from './lib/michel.js';
import { rngFrom } from './lib/format.js';

const W = 1200, H = 675;
const INK = {
  ink: '#000000',
  quartz: '#E2E7EB',
  mist: '#8E979F',
  dim: '#5B646C',
  line: 'rgba(226,231,235,0.12)',
  line2: 'rgba(226,231,235,0.2)',
  red: '#FF4128',
  grid: 'rgba(226,231,235,0.035)',
  tick: 'rgba(226,231,235,0.16)',
  tickMajor: 'rgba(226,231,235,0.4)',
  ring: 'rgba(226,231,235,0.13)',
};
// lab paper: the crystal sits in a black eyepiece, everything else is ink on paper
const PAPER = {
  ink: '#F6F7F4',
  quartz: '#0C0E10',
  mist: '#59616A',
  dim: '#8A9299',
  line: 'rgba(12,14,16,0.12)',
  line2: 'rgba(12,14,16,0.24)',
  red: '#E2391F',
  grid: 'rgba(12,14,16,0.04)',
  tick: 'rgba(12,14,16,0.28)',
  tickMajor: 'rgba(12,14,16,0.7)',
  ring: 'rgba(12,14,16,0.22)',
};
let C = INK;
const SANS = "'Instrument Sans Variable', 'Instrument Sans', system-ui, sans-serif";
const SERIF = "'Instrument Serif', serif";
const MONO = "'Fragment Mono', ui-monospace, monospace";

let fontsReady = null;
export function loadCardFonts() {
  if (!fontsReady && document.fonts) {
    fontsReady = Promise.all([
      document.fonts.load(`500 96px ${SANS}`),
      document.fonts.load(`600 20px ${SANS}`),
      document.fonts.load(`italic 22px ${SERIF}`),
      document.fonts.load(`16px ${MONO}`),
    ]).catch(() => {});
  }
  return fontsReady || Promise.resolve();
}

function setFont(ctx, spec, stretch = 'normal') {
  ctx.font = spec; // setting font resets fontStretch, so stretch goes second
  try { ctx.fontStretch = stretch; } catch {}
}

/** Deterministic crystal from 32 bytes. */
export function crystalFrom(hash) {
  const rng = rngFrom(hash);
  const habit = hash[0] % 3;
  const R = 4 + (hash[1] % 2);
  const T = habit === 0 ? R - 1.5 : habit === 1 ? R : R - 1;
  const inside = (x, y, z) => Math.abs(x) + Math.abs(y) + Math.abs(z) <= R + 1e-6 && Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) <= T + 1e-6;
  const nodes = [];
  const idx = new Map();
  const k = (x, y, z) => `${x},${y},${z}`;
  const M = Math.ceil(T);
  for (let x = -M; x <= M; x++) for (let y = -M; y <= M; y++) for (let z = -M; z <= M; z++) {
    if (!inside(x, y, z)) continue;
    idx.set(k(x, y, z), nodes.length);
    nodes.push({ p: [x, y, z], fill: false, inc: false, seed: rng() });
  }
  const cubic = nodes.length;
  for (let x = -M; x < M; x++) for (let y = -M; y < M; y++) for (let z = -M; z < M; z++) {
    const c = [x + 0.5, y + 0.5, z + 0.5];
    if (!inside(...c)) continue;
    nodes.push({ p: c, fill: true, cell: [x, y, z], inc: rng() < 0.06, seed: rng() });
  }
  const edges = [];
  for (let i = 0; i < cubic; i++) {
    const [x, y, z] = nodes[i].p;
    for (const [dx, dy, dz] of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
      const j = idx.get(k(x + dx, y + dy, z + dz));
      if (j !== undefined) edges.push([i, j, false]);
    }
  }
  for (let i = cubic; i < nodes.length; i++) {
    const [cx, cy, cz] = nodes[i].cell;
    for (const dx of [0, 1]) for (const dy of [0, 1]) for (const dz of [0, 1]) {
      const j = idx.get(k(cx + dx, cy + dy, cz + dz));
      if (j !== undefined) edges.push([i, j, true]);
    }
  }
  const rot = [0.42 + (hash[2] / 255) * 0.5, (hash[3] / 255) * Math.PI, (hash[4] / 255 - 0.5) * 0.5];
  const radius = Math.max(...nodes.map((n) => Math.hypot(...n.p)));
  return { nodes, edges, rot, radius, habit };
}

function rotate([x, y, z], [ax, ay, az]) {
  let c = Math.cos(ay), s = Math.sin(ay);
  [x, z] = [x * c + z * s, -x * s + z * c];
  c = Math.cos(ax); s = Math.sin(ax);
  [y, z] = [y * c - z * s, y * s + z * c];
  c = Math.cos(az); s = Math.sin(az);
  [x, y] = [x * c - y * s, x * s + y * c];
  return [x, y, z];
}

/** Draws a crystal at (cx, cy) with given pixel radius. strained: jitter + interference colours. */
export function drawCrystal(ctx, cr, cx, cy, rpx, { strained = false, defects = 0.07, seed = [1, 2, 3, 4] } = {}) {
  const rng = rngFrom(seed);
  const scale = rpx / cr.radius;
  const f = cr.radius * 4.2;
  const pts = cr.nodes.map((n) => {
    let p = n.p.slice();
    let d = 0;
    const defect = strained && !n.fill && rng() < defects;
    if (strained) {
      const a = (defect ? 0.3 : 0.09) * (0.6 + rng() * 0.8);
      const j = [(rng() - 0.5) * 2 * a, (rng() - 0.5) * 2 * a, (rng() - 0.5) * 2 * a];
      p = [p[0] + j[0], p[1] + j[1], p[2] + j[2]];
      d = Math.hypot(...j);
    }
    const r = rotate(p, cr.rot);
    const s = f / (f - r[2]);
    return { x: cx + r[0] * scale * s, y: cy - r[1] * scale * s, z: r[2], s, d, defect, fill: n.fill, inc: n.inc, raw: p };
  });
  const depth = (z) => Math.min(1, Math.max(0, (z + cr.radius) / (2 * cr.radius)));
  const order = cr.edges.map((e, i) => i).sort((a, b) => pts[cr.edges[a][0]].z + pts[cr.edges[a][1]].z - (pts[cr.edges[b][0]].z + pts[cr.edges[b][1]].z));
  ctx.lineCap = 'round';
  for (const i of order) {
    const [a, b, diag] = cr.edges[i];
    const A = pts[a], B = pts[b];
    if (strained && diag) continue; // body-centred nodes only exist once sealed
    const dz = depth((A.z + B.z) / 2);
    if (strained) {
      const rest = Math.hypot(...cr.nodes[b].p.map((v, k) => v - cr.nodes[a].p[k]));
      const len = Math.hypot(...B.raw.map((v, k) => v - A.raw[k]));
      const strain = Math.abs(len - rest) / rest;
      const nm = 120 + strain * 2600 + (A.defect || B.defect ? 520 : 0);
      ctx.strokeStyle = interferenceCss(nm, 0.25 + dz * 0.65);
      ctx.lineWidth = 1.1 + dz * 0.6;
    } else {
      ctx.strokeStyle = `rgba(226,231,235,${(diag ? 0.07 : 0.16) + dz * (diag ? 0.18 : 0.5)})`;
      ctx.lineWidth = diag ? 0.8 : 1 + dz * 0.5;
    }
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
    ctx.stroke();
  }
  const porder = pts.map((p, i) => i).sort((a, b) => pts[a].z - pts[b].z);
  for (const i of porder) {
    const p = pts[i];
    if (strained && p.fill) continue;
    const dz = depth(p.z);
    let r = (p.fill ? 1.5 : 2.1) * (0.7 + dz * 0.6);
    if (strained) {
      ctx.fillStyle = p.defect ? C.red : interferenceCss(p.d * 2600 + 80, 0.4 + dz * 0.6);
      if (p.defect) r *= 1.7;
    } else {
      ctx.fillStyle = `rgba(236,240,243,${0.35 + dz * 0.65})`;
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    if (!strained && p.inc) {
      ctx.strokeStyle = `rgba(236,240,243,${0.3 + dz * 0.5})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6 + dz * 3, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

// the LATTICE voxel l on a black tile (same build as the site logo and X avatar), 24-unit box
const MARK = [["r",[[12.29,18.64],[12.74,18.19],[12.74,20.06],[12.29,20.51]]],["r",[[14.39,18.64],[14.84,18.19],[14.84,20.06],[14.39,20.51]]],["r",[[16.49,18.64],[16.94,18.19],[16.94,20.06],[16.49,20.51]]],["r",[[18.59,18.64],[19.04,18.19],[19.04,20.06],[18.59,20.51]]],["t",[[10.42,18.64],[12.29,18.64],[12.74,18.19],[10.87,18.19]]],["t",[[12.52,18.64],[14.39,18.64],[14.84,18.19],[12.97,18.19]]],["t",[[14.62,18.64],[16.49,18.64],[16.94,18.19],[15.07,18.19]]],["t",[[16.72,18.64],[18.59,18.64],[19.04,18.19],[17.17,18.19]]],["r",[[10.19,16.54],[10.64,16.09],[10.64,17.96],[10.19,18.41]]],["r",[[12.29,16.54],[12.74,16.09],[12.74,17.96],[12.29,18.41]]],["r",[[14.39,16.54],[14.84,16.09],[14.84,17.96],[14.39,18.41]]],["t",[[8.32,16.54],[10.19,16.54],[10.64,16.09],[8.77,16.09]]],["t",[[10.42,16.54],[12.29,16.54],[12.74,16.09],[10.87,16.09]]],["t",[[12.52,16.54],[14.39,16.54],[14.84,16.09],[12.97,16.09]]],["r",[[10.19,14.44],[10.64,13.99],[10.64,15.86],[10.19,16.31]]],["r",[[12.29,14.44],[12.74,13.99],[12.74,15.86],[12.29,16.31]]],["t",[[8.32,14.44],[10.19,14.44],[10.64,13.99],[8.77,13.99]]],["t",[[10.42,14.44],[12.29,14.44],[12.74,13.99],[10.87,13.99]]],["r",[[10.19,12.34],[10.64,11.89],[10.64,13.76],[10.19,14.21]]],["r",[[12.29,12.34],[12.74,11.89],[12.74,13.76],[12.29,14.21]]],["t",[[8.32,12.34],[10.19,12.34],[10.64,11.89],[8.77,11.89]]],["t",[[10.42,12.34],[12.29,12.34],[12.74,11.89],[10.87,11.89]]],["r",[[10.19,10.24],[10.64,9.79],[10.64,11.66],[10.19,12.11]]],["r",[[12.29,10.24],[12.74,9.79],[12.74,11.66],[12.29,12.11]]],["t",[[8.32,10.24],[10.19,10.24],[10.64,9.79],[8.77,9.79]]],["t",[[10.42,10.24],[12.29,10.24],[12.74,9.79],[10.87,9.79]]],["r",[[10.19,8.14],[10.64,7.69],[10.64,9.56],[10.19,10.01]]],["r",[[12.29,8.14],[12.74,7.69],[12.74,9.56],[12.29,10.01]]],["t",[[8.32,8.14],[10.19,8.14],[10.64,7.69],[8.77,7.69]]],["t",[[10.42,8.14],[12.29,8.14],[12.74,7.69],[10.87,7.69]]],["r",[[8.09,6.04],[8.54,5.59],[8.54,7.46],[8.09,7.91]]],["r",[[10.19,6.04],[10.64,5.59],[10.64,7.46],[10.19,7.91]]],["r",[[12.29,6.04],[12.74,5.59],[12.74,7.46],[12.29,7.91]]],["t",[[6.22,6.04],[8.09,6.04],[8.54,5.59],[6.67,5.59]]],["t",[[8.32,6.04],[10.19,6.04],[10.64,5.59],[8.77,5.59]]],["t",[[10.42,6.04],[12.29,6.04],[12.74,5.59],[10.87,5.59]]],["r",[[8.09,3.94],[8.54,3.49],[8.54,5.36],[8.09,5.81]]],["r",[[10.19,3.94],[10.64,3.49],[10.64,5.36],[10.19,5.81]]],["r",[[12.29,3.94],[12.74,3.49],[12.74,5.36],[12.29,5.81]]],["t",[[6.22,3.94],[8.09,3.94],[8.54,3.49],[6.67,3.49]]],["t",[[8.32,3.94],[10.19,3.94],[10.64,3.49],[8.77,3.49]]],["t",[[10.42,3.94],[12.29,3.94],[12.74,3.49],[10.87,3.49]]],["f",[[10.42,18.64],[12.29,18.64],[12.29,20.51],[10.42,20.51]]],["f",[[12.52,18.64],[14.39,18.64],[14.39,20.51],[12.52,20.51]]],["f",[[14.62,18.64],[16.49,18.64],[16.49,20.51],[14.62,20.51]]],["f",[[16.72,18.64],[18.59,18.64],[18.59,20.51],[16.72,20.51]]],["f",[[8.32,16.54],[10.19,16.54],[10.19,18.41],[8.32,18.41]]],["f",[[10.42,16.54],[12.29,16.54],[12.29,18.41],[10.42,18.41]]],["f",[[12.52,16.54],[14.39,16.54],[14.39,18.41],[12.52,18.41]]],["f",[[8.32,14.44],[10.19,14.44],[10.19,16.31],[8.32,16.31]]],["f",[[10.42,14.44],[12.29,14.44],[12.29,16.31],[10.42,16.31]]],["f",[[8.32,12.34],[10.19,12.34],[10.19,14.21],[8.32,14.21]]],["f",[[10.42,12.34],[12.29,12.34],[12.29,14.21],[10.42,14.21]]],["f",[[8.32,10.24],[10.19,10.24],[10.19,12.11],[8.32,12.11]]],["f",[[10.42,10.24],[12.29,10.24],[12.29,12.11],[10.42,12.11]]],["f",[[8.32,8.14],[10.19,8.14],[10.19,10.01],[8.32,10.01]]],["f",[[10.42,8.14],[12.29,8.14],[12.29,10.01],[10.42,10.01]]],["f",[[6.22,6.04],[8.09,6.04],[8.09,7.91],[6.22,7.91]]],["f",[[8.32,6.04],[10.19,6.04],[10.19,7.91],[8.32,7.91]]],["f",[[10.42,6.04],[12.29,6.04],[12.29,7.91],[10.42,7.91]]],["f",[[6.22,3.94],[8.09,3.94],[8.09,5.81],[6.22,5.81]]],["f",[[8.32,3.94],[10.19,3.94],[10.19,5.81],[8.32,5.81]]],["f",[[10.42,3.94],[12.29,3.94],[12.29,5.81],[10.42,5.81]]]];
const MARK_FILL = { t: '#F3F3F3', f: '#E4E4E4', r: '#8E8E8E' };
function drawMark(ctx, x, y, s, paper) {
  const k = s / 24;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.roundRect(0, 0, 24, 24, 5.3);
  ctx.fill();
  if (!paper) { ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 0.5; ctx.stroke(); }
  for (const [face, pts] of MARK) {
    ctx.beginPath();
    pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.closePath();
    ctx.fillStyle = MARK_FILL[face];
    ctx.fill();
  }
  ctx.restore();
}

function wrap(ctx, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * data: { mode, title, sub, rows: [[label, value, cls]], caption, id, hash, wallet, foot }
 */
export async function drawCard(canvas, data, scaleFactor = 2) {
  await loadCardFonts();
  canvas.width = W * scaleFactor;
  canvas.height = H * scaleFactor;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(scaleFactor, 0, 0, scaleFactor, 0, 0);
  const sealed = data.mode !== 'exposed';
  const paper = data.theme === 'paper';
  C = paper ? PAPER : INK;

  // ground
  ctx.fillStyle = C.ink;
  ctx.fillRect(0, 0, W, H);
  // faint field grid
  ctx.strokeStyle = C.grid;
  ctx.lineWidth = 1;
  for (let x = 30; x < W; x += 30) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke(); }
  for (let y = 30; y < H; y += 30) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke(); }
  if (!paper) {
    const vg = ctx.createRadialGradient(330, 338, 60, 330, 338, 620);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  // frame with corner ticks
  ctx.strokeStyle = C.line;
  ctx.strokeRect(24.5, 24.5, W - 49, H - 49);
  ctx.strokeStyle = C.quartz;
  ctx.globalAlpha = 0.6;
  const t = 16;
  for (const [x, y, dx, dy] of [[24.5, 24.5, 1, 1], [W - 24.5, 24.5, -1, 1], [24.5, H - 24.5, 1, -1], [W - 24.5, H - 24.5, -1, -1]]) {
    ctx.beginPath();
    ctx.moveTo(x, y + dy * t); ctx.lineTo(x, y); ctx.lineTo(x + dx * t, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // reticle ring behind the crystal (on paper: a black eyepiece inside an ink reticle)
  const cx = 330, cy = 336, rr = 250;
  if (paper) {
    const disc = 236;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, disc);
    g.addColorStop(0, '#0d1013');
    g.addColorStop(1, '#010101');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, disc, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = C.ring;
  ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.stroke();
  for (let a = 0; a < 360; a += 5) {
    const rad = (a * Math.PI) / 180;
    const len = a % 45 === 0 ? 14 : 6;
    ctx.strokeStyle = a % 45 === 0 ? C.tickMajor : C.tick;
    const r0 = paper ? rr : rr, r1 = paper ? rr + len : rr - len;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(rad) * r0, cy + Math.sin(rad) * r0);
    ctx.lineTo(cx + Math.cos(rad) * r1, cy + Math.sin(rad) * r1);
    ctx.stroke();
  }
  ctx.setLineDash([2, 6]);
  ctx.strokeStyle = paper ? 'rgba(226,231,235,0.08)' : 'rgba(226,231,235,0.09)';
  ctx.beginPath(); ctx.moveTo(cx - rr + 14, cy); ctx.lineTo(cx + rr - 14, cy); ctx.moveTo(cx, cy - rr + 14); ctx.lineTo(cx, cy + rr - 14); ctx.stroke();
  ctx.setLineDash([]);
  if (paper) {
    setFont(ctx, `italic 22px ${SERIF}`);
    ctx.fillStyle = C.mist;
    ctx.textAlign = 'left';
    ctx.fillText('P', cx + rr + 22, cy + 7);
    ctx.textAlign = 'center';
    ctx.fillText('A', cx, cy - rr - 22);
    ctx.textAlign = 'left';
  }

  // crystal
  const cr = crystalFrom(data.hash);
  drawCrystal(ctx, cr, cx, cy, paper ? (sealed ? 196 : 186) : sealed ? 206 : 196, { strained: !sealed, seed: data.hash.slice(5, 13) });

  // caption under crystal
  setFont(ctx, `italic 22px ${SERIF}`);
  ctx.fillStyle = C.quartz;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('Fig.', 56, 630);
  const figW = ctx.measureText('Fig. ').width;
  setFont(ctx, `18px ${SANS}`);
  ctx.fillStyle = C.mist;
  ctx.fillText(data.caption, 56 + figW, 630);

  // header right
  drawMark(ctx, 638, 50, 32, paper);
  setFont(ctx, `600 22px ${SANS}`, 'semi-condensed');
  ctx.fillStyle = C.quartz;
  ctx.fillText('Lattice', 682, 76);
  setFont(ctx, `16px ${MONO}`);
  ctx.fillStyle = C.mist;
  ctx.textAlign = 'right';
  ctx.fillText(data.id, 1150, 75);
  ctx.textAlign = 'left';

  // title
  setFont(ctx, `500 124px ${SANS}`, 'condensed');
  ctx.fillStyle = data.mode === 'exposed' ? C.red : data.mode === 'specimen' ? C.mist : C.quartz;
  try { ctx.letterSpacing = '-4px'; } catch {}
  ctx.fillText(data.title, 638, 212);
  try { ctx.letterSpacing = '0px'; } catch {}

  // sub
  setFont(ctx, `25px ${SANS}`);
  ctx.fillStyle = C.mist;
  const subLines = wrap(ctx, data.sub, 506).slice(0, 2);
  subLines.forEach((l, i) => ctx.fillText(l, 644, 262 + i * 32));

  // rows
  let y = subLines.length > 1 ? 330 : 312;
  const rh = subLines.length > 1 ? 48 : 52;
  ctx.strokeStyle = C.line2;
  ctx.beginPath(); ctx.moveTo(644, y - 2); ctx.lineTo(1150, y - 2); ctx.stroke();
  for (const [label, value, cls] of data.rows.slice(0, 5)) {
    setFont(ctx, `19px ${SANS}`);
    ctx.fillStyle = C.mist;
    ctx.fillText(label, 644, y + rh / 2 + 6);
    setFont(ctx, `18px ${MONO}`);
    ctx.fillStyle = cls === 'red' ? C.red : cls === 'dim' ? C.dim : C.quartz;
    ctx.textAlign = 'right';
    ctx.fillText(value, 1150, y + rh / 2 + 6);
    ctx.textAlign = 'left';
    y += rh;
    ctx.strokeStyle = C.line;
    ctx.beginPath(); ctx.moveTo(644, y - 2); ctx.lineTo(1150, y - 2); ctx.stroke();
  }

  // footer
  setFont(ctx, `italic 25px ${SERIF}`);
  ctx.fillStyle = C.quartz;
  ctx.fillText('Built for the day after Q-day.', 644, 630);
  setFont(ctx, `16px ${MONO}`);
  ctx.fillStyle = C.mist;
  ctx.textAlign = 'right';
  ctx.fillText(data.foot, 1150, 629);
  ctx.textAlign = 'left';
  return canvas;
}

export function canvasBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
