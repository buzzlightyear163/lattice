export const nf = new Intl.NumberFormat('en-US');
export const fmtInt = (n) => nf.format(Math.round(n));
export const fmtBytes = (n) => `${nf.format(n)} B`;
export const shortAddr = (a, n = 4) => (a && a.length > n * 2 + 1 ? `${a.slice(0, n)}…${a.slice(-n)}` : a || '');
export const fmtDate = (d) =>
  d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).replace(/ /g, '\u00a0');
export const fmtMs = (ms) => (ms < 10 ? ms.toFixed(2) : ms < 100 ? ms.toFixed(1) : Math.round(ms).toString()) + ' ms';

export function toHex(bytes, max = bytes.length) {
  let s = '';
  for (let i = 0; i < Math.min(max, bytes.length); i++) s += bytes[i].toString(16).padStart(2, '0');
  return s;
}
export function groupHex(hex, size = 4, groups = 4) {
  const out = [];
  for (let i = 0; i < groups; i++) out.push(hex.slice(i * size, i * size + size));
  return out.join(' ');
}

export function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromB64(str) {
  const bin = atob(str.trim());
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function download(filename, content, type = 'application/json') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Small deterministic PRNG from bytes (xorshift32). */
export function rngFrom(bytes) {
  let s = 0x9e3779b9;
  for (let i = 0; i < bytes.length; i++) s = (Math.imul(s ^ bytes[i], 0x01000193) + i) >>> 0;
  if (!s) s = 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export const prefersReducedMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
