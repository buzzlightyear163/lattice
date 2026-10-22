// Interference colours of a birefringent material between crossed polarizers
// (the Michel-Lévy chart), computed from physics rather than hand-picked:
//   transmitted(λ) = sin²(π·Γ/λ), integrated against the CIE 1931 observer.
// Γ is retardation in nanometres. Used for the strained (exposed) lattice.

function g(x, mu, s1, s2) {
  const t = (x - mu) / (x < mu ? s1 : s2);
  return Math.exp(-0.5 * t * t);
}
// Wyman, Sloan & Shirley (2013) multi-lobe fit of the CIE 1931 colour matching functions.
function cie(l) {
  const x = 1.056 * g(l, 599.8, 37.9, 31.0) + 0.362 * g(l, 442.0, 16.0, 26.7) - 0.065 * g(l, 501.1, 20.4, 26.2);
  const y = 0.821 * g(l, 568.8, 46.9, 40.5) + 0.286 * g(l, 530.9, 16.3, 31.1);
  const z = 1.217 * g(l, 437.0, 11.8, 36.0) + 0.681 * g(l, 459.0, 26.0, 13.8);
  return [x, y, z];
}
function xyzToLinear([X, Y, Z]) {
  return [
    3.2406 * X - 1.5372 * Y - 0.4986 * Z,
    -0.9689 * X + 1.8758 * Y + 0.0415 * Z,
    0.0557 * X - 0.204 * Y + 1.057 * Z,
  ];
}
const gamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

let cached = null;

export const MAX_RETARDATION = 1600; // nm

/** Returns Float32Array RGB (0..1, sRGB-encoded) of `size` samples over 0..MAX_RETARDATION nm. */
export function interferenceTable(size = 512) {
  if (cached && cached.size === size) return cached.data;
  const lambdas = [];
  for (let l = 380; l <= 740; l += 4) lambdas.push(l);
  const cmf = lambdas.map(cie);
  // white reference: full transmission
  let W = [0, 0, 0];
  for (const c of cmf) { W[0] += c[0]; W[1] += c[1]; W[2] += c[2]; }
  const Wl = xyzToLinear(W);
  const data = new Float32Array(size * 3);
  for (let i = 0; i < size; i++) {
    const G = (i / (size - 1)) * MAX_RETARDATION;
    let X = 0, Y = 0, Z = 0;
    for (let k = 0; k < lambdas.length; k++) {
      const s = Math.sin((Math.PI * G) / lambdas[k]);
      const t = s * s;
      X += t * cmf[k][0]; Y += t * cmf[k][1]; Z += t * cmf[k][2];
    }
    const lin = xyzToLinear([X, Y, Z]);
    for (let c = 0; c < 3; c++) {
      const v = Math.min(1, Math.max(0, lin[c] / Wl[c]));
      data[i * 3 + c] = gamma(v);
    }
  }
  cached = { size, data };
  return data;
}

/** CSS colour for a retardation value (nm). */
export function interferenceCss(nm, alpha = 1) {
  const size = 512;
  const t = interferenceTable(size);
  const i = Math.max(0, Math.min(size - 1, Math.round((nm / MAX_RETARDATION) * (size - 1))));
  const r = Math.round(t[i * 3] * 255), gg = Math.round(t[i * 3 + 1] * 255), b = Math.round(t[i * 3 + 2] * 255);
  return `rgba(${r},${gg},${b},${alpha})`;
}

/** Paints the chart as a horizontal bar into a canvas. */
export function paintColorbar(canvas, maxNm = 1200) {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d');
  for (let x = 0; x < w; x++) {
    ctx.fillStyle = interferenceCss((x / (w - 1)) * maxNm);
    ctx.fillRect(x, 0, 1, h);
  }
}
