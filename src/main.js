import '@fontsource-variable/instrument-sans/wdth.css';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource/fragment-mono/400.css';
import './style.css';

import Lenis from 'lenis';
import { sha3_256 } from '@noble/hashes/sha3.js';
import { CONFIG } from './config.js';
import { state, set, subscribe } from './lib/state.js';
import { SCHEMES } from './lib/schemes.js';
import { fmtInt, fmtDate, fmtMs, shortAddr, groupHex, download, sleep, prefersReducedMotion, clamp } from './lib/format.js';
import { paintColorbar } from './lib/michel.js';
import { Specimen } from './specimen.js';
import { Terminal, T } from './terminal.js';
import { scan, inspectAddress, getSlot, getSolBalance, getTokenBalance, endpointLabel } from './rpc.js';
import { warmup, forgeKey, sealKey, sealId, sealFile, keyFile, verifyCosign, sigToB58 } from './forge.js';
import { connect, signMessage } from './wallet.js';
import { drawCard, canvasBlob } from './sealcard.js';
import { Sequence } from './sequence.js';
import { Space } from './space.js';
import { Verifier } from './verify.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = prefersReducedMotion();

/* ---------------- theme: 'ink' (black) or 'paper' (lab paper with dark eyepieces) ---------------- */
const THEME = new URLSearchParams(location.search).get('theme') || import.meta.env.VITE_THEME || CONFIG.theme || 'ink';
document.documentElement.dataset.theme = THEME;
if (THEME === 'paper') document.querySelector('meta[name="theme-color"]').setAttribute('content', '#f6f7f4');

/* ---------------- config-driven links ---------------- */
$$('[data-buy]').forEach((a) => (a.href = CONFIG.buyUrl));
$$('[data-x]').forEach((a) => (a.href = CONFIG.x));
if (CONFIG.mint) {
  $('[data-ca-value]').textContent = CONFIG.mint;
  const b = $('[data-ca-copy]');
  b.hidden = false;
  b.addEventListener('click', () => copyText(CONFIG.mint, 'Contract address copied'));
}

/* ---------------- smooth scroll ---------------- */
let lenis = null;
if (!reduced) {
  lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
  const raf = (t) => {
    lenis.raf(t);
    requestAnimationFrame(raf);
  };
  requestAnimationFrame(raf);
}
function scrollToEl(el) {
  if (!el) return;
  if (lenis) lenis.scrollTo(el, { offset: -70, duration: 1.2 });
  else el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  const id = a.getAttribute('href');
  const el = id.length > 1 ? $(id) : $('#top');
  if (!el) return;
  e.preventDefault();
  scrollToEl(el);
});

/* ---------------- specimen ---------------- */
let specimen = null;
try {
  specimen = new Specimen($('#specimen'));
  specimen.setPaper(THEME === 'paper');
  $$('[data-backdrop]').forEach((el) => specimen.addBackdrop(el));
  $$('[data-specimen-slot]').forEach((el) => specimen.addSlot(el));
  $$('[data-specimen-hide]').forEach((el) => specimen.addSuppressor(el));
  specimen.enableDrag($('.scope'));
  specimen.onSlot = (name) => $('.companion').classList.toggle('on', name === 'corner');
  if (lenis) lenis.on('scroll', (e) => specimen.velocity(e.velocity));
} catch (e) {
  console.warn('WebGL unavailable, running without the 3D specimen.', e);
  document.documentElement.classList.add('no-webgl');
}

/* ---------------- reticle ---------------- */
(function buildReticle() {
  const svg = $('[data-reticle]');
  let h = '<circle class="ring" cx="500" cy="500" r="470"/><circle class="ring-inner" cx="500" cy="500" r="408"/>';
  h += '<line class="cross" x1="10" y1="500" x2="990" y2="500"/><line class="cross" x1="500" y1="10" x2="500" y2="990"/>';
  for (let a = 0; a < 360; a += 5) {
    const major = a % 45 === 0;
    const len = major ? 24 : a % 15 === 0 ? 13 : 7;
    const r = (a * Math.PI) / 180;
    const x1 = 500 + Math.cos(r) * 470, y1 = 500 + Math.sin(r) * 470;
    const x2 = 500 + Math.cos(r) * (470 - len), y2 = 500 + Math.sin(r) * (470 - len);
    h += `<line class="tick${major ? ' tick-major' : ''}" style="--td:${Math.round(300 + a * 4.2)}ms" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
  }
  for (const a of [45, 135, 225, 315]) {
    const r = ((a - 90) * Math.PI) / 180;
    const x = 500 + Math.cos(r) * 438, y = 500 + Math.sin(r) * 438;
    h += `<text x="${x.toFixed(1)}" y="${(y + 5).toFixed(1)}" text-anchor="middle">${a}</text>`;
  }
  h += '<g data-needle><path d="M500 476 L493 462 L507 462 Z" fill="#E2E7EB" transform="translate(0 -6)"/></g>';
  svg.innerHTML = h;
  if (!reduced) svg.classList.add('reticle-draw');
})();
paintColorbar($('[data-colorbar]'), 1200);

/* ---------------- headline: letters settle into place once ---------------- */
(function splitHeadline() {
  const h1 = $('[data-split]');
  const sup = h1.querySelector('sup');
  sup.remove();
  const text = h1.textContent.trim();
  h1.textContent = '';
  const vis = document.createElement('span');
  vis.setAttribute('aria-hidden', 'true');
  const words = text.split(' ');
  let i = 0;
  words.forEach((w, wi) => {
    const ws = document.createElement('span');
    ws.className = 'w';
    for (const ch of w) {
      const s = document.createElement('span');
      s.className = 'ch';
      s.textContent = ch;
      s.style.setProperty('--x', `${((Math.random() - 0.5) * 0.36).toFixed(3)}em`);
      s.style.setProperty('--y', `${((Math.random() - 0.5) * 0.5).toFixed(3)}em`);
      s.style.setProperty('--r', `${((Math.random() - 0.5) * 22).toFixed(1)}deg`);
      s.style.setProperty('--d', `${Math.round(160 + i * 26 + Math.random() * 90)}ms`);
      ws.appendChild(s);
      i++;
    }
    vis.appendChild(ws);
    if (wi < words.length - 1) vis.appendChild(document.createTextNode(' '));
  });
  const sr = document.createElement('span');
  sr.className = 'sr-only';
  sr.textContent = text;
  h1.append(sr, vis, sup);
  if (reduced) return;
  h1.classList.add('pre');
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      h1.classList.add('settle');
      h1.classList.remove('pre');
    }),
  );
})();

/* ---------------- toast ---------------- */
let toastTimer = 0;
function toast(msg) {
  const t = $('[data-toast]');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
async function copyText(text, msg) {
  try {
    await navigator.clipboard.writeText(text);
    toast(msg || 'Copied');
  } catch {
    toast('Copy failed. Select the text instead.');
  }
}

/* ---------------- terminal ---------------- */
const tty = new Terminal($('#tty'), { onCommand: runCommand });

const HELP = [
  ['scan <address>', 'exposure report for a wallet'],
  ['forge [scheme]', 'ml-dsa-65 (default), falcon-512, ml-dsa-87, falcon-1024'],
  ['status', 'what this page knows right now'],
  ['cosign', 'sign the pledge with your wallet'],
  ['seal', 'jump to your seal card'],
  ['verify', 'verify your seal locally'],
  ['keyfile', 'download your lattice secret key'],
  ['ca', 'contract address'],
  ['about', 'what is real and what is not live'],
  ['clear', 'clear the screen'],
];

function runCommand(input) {
  const parts = input.trim().split(/\s+/);
  const c = parts[0].toLowerCase();
  const args = parts.slice(1).filter((a) => !a.startsWith('--scheme'));
  // a bare address is a scan
  if (inspectAddress(parts[0]).valid) return doScan(parts[0], { fromTty: true });
  switch (c) {
    case 'help':
    case '?':
      HELP.forEach(([k, v]) => tty.line(T.kv(k, T.dim(v), 17)));
      break;
    case 'scan':
      if (!args[0]) tty.line(T.err('scan: paste an address after scan'));
      else doScan(args[0], { fromTty: true });
      break;
    case 'forge':
      doForge(args[0] && args[0].replace(/^--/, ''), { fromTty: true });
      break;
    case 'status':
      printStatus();
      break;
    case 'cosign':
      doCosign({ fromTty: true });
      break;
    case 'seal':
      scrollToEl($('#seal'));
      break;
    case 'verify':
      if (!state.seal) tty.line(T.dim('nothing to verify yet. forge a key first.'));
      else {
        $('[data-verify-input]').value = JSON.stringify(sealFile(state), null, 2);
        verifier.run();
        scrollToEl($('#verify'));
      }
      break;
    case 'keyfile':
      downloadKeyfile();
      break;
    case 'ca':
      tty.line(T.kv('ca', CONFIG.mint ? T.v(CONFIG.mint) : T.dim('posted on X at launch')));
      break;
    case 'buy':
      window.open(CONFIG.buyUrl, '_blank', 'noopener');
      break;
    case 'about':
      tty.line(T.kv('real', T.v('ML-DSA and Falcon keys, signatures and checks, in a Web Worker')));
      tty.line(T.kv('real', T.v('exposure data, read live from Solana RPC')));
      tty.line(T.kv('not live', T.dim('the on-chain vault. Solana does not verify lattice signatures yet')));
      break;
    case 'clear':
      tty.clear();
      break;
    case 'whoami':
      tty.line(T.kv('wallet', state.wallet ? T.v(state.wallet) : T.dim('none scanned')));
      break;
    case 'sudo':
      tty.line(T.dim('no root here. only lattices.'));
      break;
    default:
      tty.line(T.err(`lattice: unknown command "${parts[0]}". type help`));
  }
}

function printStatus() {
  const r = state.report;
  tty.line(T.kv('wallet', r ? T.v(shortAddr(r.address, 6)) : T.dim('none')));
  tty.line(T.kv('scheme', state.key ? T.v(SCHEMES[state.key.scheme].name) : T.v('ed25519')));
  tty.line(T.kv('shor-safe', state.seal && state.seal.ok ? T.ok('yes') : T.err('no')));
  tty.line(T.kv('in open', r && r.onCurve ? T.v(`${fmtInt(r.days)} days`) : T.dim('unknown, scan a wallet')));
  tty.line(T.kv('co-signed', state.cosign && state.cosign.ok ? T.ok('yes') : T.dim('no')));
}

async function boot() {
  tty.line(T.dim('lattice 1.0, post-quantum key forge'));
  tty.line(T.kv('engine', T.v('@noble/post-quantum 0.7.1')));
  tty.line(T.kv('schemes', T.v('ml-dsa-65/87  falcon-512/1024')));
  const sp = tty.spinner(T.kv('worker', T.dim('warming up ')));
  try {
    const w = await warmup();
    sp.done(T.kv('worker', T.ok('ready') + T.dim(`  round trip ${fmtMs(w.ms)}`)));
    $('[data-forge-engine]').textContent = `ready, ${fmtMs(w.ms)} round trip`;
    set({ workerReady: w.ms });
  } catch (e) {
    sp.done(T.kv('worker', T.err(`failed: ${e.message}`)));
    $('[data-forge-engine]').textContent = 'unavailable';
  }
  await sleep(380);
  if (!state.report && !state.key) {
    await tty.typeCmd('status');
    printStatus();
    tty.line(T.dim('type help, or paste a wallet address'));
  }
}

/* ---------------- report panel ---------------- */
const heroEl = $('#top');
const reportEl = $('#report');
const forgeBtn = $('[data-forge]');

function row(label, value, extra = '') {
  return `<div class="${extra}"><dt>${T.esc(label)}</dt><dd>${value}</dd></div>`;
}
function statusHtml() {
  if (state.seal && state.seal.ok) return `<span class="status sealed"><i></i>Sealed, ${T.esc(SCHEMES[state.key.scheme].name)}</span>`;
  if (state.report && !state.report.onCurve) return '<span class="status na"><i></i>No private key exists</span>';
  return '<span class="status exposed"><i></i>Exposed</span>';
}

function renderReport(loadingAddr) {
  const rows = $('[data-report-rows]');
  reportEl.hidden = false;
  heroEl.classList.add('acted');
  if (loadingAddr) {
    $('[data-report-title]').textContent = 'Exposure report';
    $('[data-report-addr]').textContent = shortAddr(loadingAddr, 6);
    rows.innerHTML = ['Key in the open', 'Signatures made', 'Behind this key', 'Signature scheme', 'Status']
      .map((l) => row(l, 'reading…', 'is-loading'))
      .join('');
    return;
  }
  const r = state.report;
  const k = state.key;
  const sealed = state.seal && state.seal.ok;
  let h = '';
  if (r) {
    $('[data-report-title]').textContent = 'Exposure report';
    $('[data-report-addr]').textContent = shortAddr(r.address, 6);
    if (!r.onCurve) {
      h += row('Address type', 'Program-derived (off-curve)');
      h += row('What that means', 'No secret key exists to steal');
    } else {
      h += row('Key in the open', r.firstSeen ? `${fmtInt(r.days)} days<small>since ${fmtDate(r.firstSeen)}</small>` : 'not seen on-chain yet');
      h += row('Signatures made', `${fmtInt(r.signatures)}${r.capped ? '+' : ''}`);
      h += row('Behind this key', `${r.sol.toLocaleString('en-US', { maximumFractionDigits: 2 })} SOL, ${fmtInt(r.tokens)} tokens`);
      h += row('Signature scheme', 'Ed25519<small>breaks under Shor</small>');
    }
  } else {
    $('[data-report-title]').textContent = 'Lattice key';
    $('[data-report-addr]').textContent = 'unbound';
    h += row('Wallet', 'Not scanned<small>the seal names no wallet</small>');
  }
  if (k && sealed) {
    const s = SCHEMES[k.scheme];
    h += row('Lattice key', `${s.name}<small>${fmtInt(k.publicKey.length)} B</small>`);
    h += row('Fingerprint', groupHex(k.fpHex, 4, 3) + '…');
  }
  h += row('Status', statusHtml(), 'report-status');
  rows.innerHTML = h;

  const canForge = !(r && !r.onCurve);
  forgeBtn.disabled = !canForge || state.forging;
  $('.btn-label', forgeBtn).textContent = state.forging ? 'Forging…' : sealed ? 'Forge again' : 'Forge lattice key';
  forgeBtn.classList.toggle('is-busy', state.forging);
  $('[data-report-after]').hidden = !sealed;
  if (!sealed || state.forging) reportEl.dataset.mode = 'open';
  else if (reportEl.dataset.mode !== 'reforge') reportEl.dataset.mode = 'sealed';
  $$('[data-scheme-seg] button').forEach((b) => {
    b.setAttribute('aria-checked', String(b.dataset.scheme === state.scheme));
    b.disabled = state.forging;
  });
}

function showScanError(msg) {
  const e = $('[data-scan-error]');
  e.textContent = msg;
  e.hidden = !msg;
}

/* ---------------- scan ---------------- */
async function doScan(address, { fromTty = false, quiet = false } = {}) {
  address = (address || '').trim();
  showScanError('');
  if (!address) {
    showScanError('Paste a Solana wallet address first.');
    return null;
  }
  const info = inspectAddress(address);
  if (!info.valid) {
    showScanError('That isn’t a Solana address. It should be 32 to 44 characters of base58.');
    if (fromTty) tty.line(T.err('scan: not a Solana address'));
    return null;
  }
  if (state.scanning) return null;
  set({ scanning: true });
  $('#addr').value = address;
  if (!fromTty) tty.cmd(`scan ${shortAddr(address, 6)}`);
  tty.busy(true, 'scanning');
  if (!quiet) renderReport(address);
  const btn = $('[data-scan-btn]');
  btn.disabled = true;
  let via = null;
  try {
    const r = await scan(address, (type, p) => {
      if (type === 'decode') tty.line(T.kv('decode', T.v('base58 → 32 bytes  ') + (p.onCurve ? T.ok('✓ on Curve25519') : T.dim('off-curve (PDA)'))));
      else if (type === 'rpc') {
        if (p.ok) {
          if (via !== p.endpoint) {
            via = p.endpoint;
            tty.line(T.kv('rpc', T.dim(`via ${endpointLabel(p.endpoint)}`)));
          }
          tty.line(T.kv('', T.v(p.label) + T.dim(`  ${fmtMs(p.ms)}`)));
        } else tty.line(T.kv('rpc', T.dim(`${endpointLabel(p.endpoint)}: ${p.error}, trying next`)));
      } else if (type === 'page') tty.line(T.kv('sigs', T.v(`page ${p.page}  ${fmtInt(p.n)}`) + T.dim(`  total ${fmtInt(p.total)}`)));
    });
    set({ report: r, wallet: r.onCurve ? r.address : null, scanning: false });
    if (specimen) specimen.setExposure(r);
    sequence.setAddress(r.address);
    if (quiet) {
      // co-sign path: the key is already sealed, just note the binding
    } else if (r.onCurve) {
      tty.line(T.kv('in open', T.v(r.firstSeen ? `${fmtInt(r.days)} days` : 'not seen on-chain yet') + (r.firstSeen ? T.dim(`  since ${fmtDate(r.firstSeen)}`) : '')));
      tty.line(T.kv('status', T.err('EXPOSED') + T.dim('  ed25519, breaks under Shor')));
      if (!state.key) tty.line(T.dim('next: forge'));
    } else {
      tty.line(T.kv('status', T.dim('no private key exists for this address')));
    }
    return r;
  } catch (e) {
    set({ scanning: false });
    tty.line(T.err(`scan failed: ${e.message}`));
    showScanError(`Couldn’t read Solana right now (${e.message}). Try again in a moment, or forge a key without scanning.`);
    if (!state.report && !state.key) reportEl.hidden = true;
    else renderReport();
    return null;
  } finally {
    tty.busy(false);
    btn.disabled = false;
  }
}

$('#scan-form').addEventListener('submit', (e) => {
  e.preventDefault();
  doScan($('#addr').value);
});
$('#addr').addEventListener('paste', () => {
  setTimeout(() => {
    const v = $('#addr').value.trim();
    if (inspectAddress(v).valid) doScan(v);
  }, 0);
});

/* ---------------- forge ---------------- */
function waitLocked() {
  const scope = $('.scope');
  scope.classList.remove('locking');
  void scope.offsetWidth; // restart the pulse animation
  scope.classList.add('locking');
  setTimeout(() => scope.classList.remove('locking'), 2000);
  return new Promise((resolve) => {
    if (!specimen) return resolve();
    specimen.onLocked = () => {
      specimen.onLocked = null;
      resolve();
    };
    specimen.lock();
  });
}

async function doForge(schemeArg, { fromTty = false } = {}) {
  if (state.forging) return;
  if (schemeArg && !SCHEMES[schemeArg]) {
    tty.line(T.err(`forge: unknown scheme "${schemeArg}". try ml-dsa-65 or falcon-512`));
    return;
  }
  if (state.report && !state.report.onCurve) {
    tty.line(T.dim('this address has no private key. scan a wallet address instead.'));
    return;
  }
  const scheme = schemeArg || state.scheme;
  const s = SCHEMES[scheme];
  if (!fromTty) tty.cmd(`forge --scheme ${scheme}`);
  set({ forging: true, seal: null, cosign: null });
  renderReport();
  tty.busy(true, 'forging');
  if (specimen && specimen.locked) {
    specimen.unlock();
    await sleep(reduced ? 50 : 650);
  }
  specimen && specimen.setAgitate(true);
  tty.line(T.kv('seed', T.v(`${scheme.startsWith('falcon') ? 48 : 32} bytes`) + T.dim('  crypto.getRandomValues')));
  const sp = tty.spinner(T.kv('keygen', T.dim(`${s.name}, ${s.family}  `)));
  const t0 = performance.now();
  let key, seal;
  try {
    key = await forgeKey(scheme);
    const minAgitate = reduced ? 0 : 950;
    const el = performance.now() - t0;
    if (el < minAgitate) await sleep(minAgitate - el);
    sp.done(T.kv('keygen', T.v(fmtMs(key.ms)) + T.dim(`  ${s.name}, ${s.family}`)));
    tty.line(T.kv('pubkey', T.v(`${fmtInt(key.publicKey.length)} B`) + T.dim(`  sha3-256 ${key.fpHex.slice(0, 16)}…`)));
    tty.line(T.kv('secret', T.v(`${fmtInt(key.secretKey.length)} B`) + T.dim('  stays on this device')));
    const wallet = state.report && state.report.onCurve ? state.report.address : null;
    seal = await sealKey(key, wallet);
    tty.line(T.kv('pledge', wallet ? T.v(`binds ${shortAddr(wallet)}`) : T.dim('unbound, no wallet scanned')));
    tty.line(T.kv('sign', T.v(fmtMs(seal.signMs)) + T.dim(`  ${fmtInt(seal.sig.length)} B signature`)));
    tty.line(T.kv('verify', T.v(fmtMs(seal.verifyMs)) + '  ' + (seal.ok ? T.ok('✓ valid') : T.err('✕ invalid'))));
  } catch (e) {
    sp.done(T.kv('keygen', T.err(e.message)));
    specimen && specimen.setAgitate(false);
    set({ forging: false });
    renderReport();
    tty.busy(false);
    return;
  }
  specimen && specimen.setKeyBytes(key.publicKey);
  specimen && specimen.setAgitate(false);
  set({ key, seal, forging: false });
  await waitLocked();
  tty.line(T.ok('lattice locked.') + T.dim(`  seal ${sealId(key.fpHex)}`));
  tty.busy(false);
  toast('Lattice locked. Your seal is ready.');
}

forgeBtn.addEventListener('click', () => doForge());
$('[data-forge-again]').addEventListener('click', () => {
  reportEl.dataset.mode = 'reforge';
  forgeBtn.focus();
});
$('[data-forge-direct]').addEventListener('click', () => {
  if (!state.report) renderReport();
  doForge();
});
$$('[data-scheme-seg] button').forEach((b) =>
  b.addEventListener('click', () => {
    if (state.forging) return;
    set({ scheme: b.dataset.scheme });
    renderReport();
  }),
);

/* ---------------- seal card ---------------- */
const cardCanvas = $('[data-seal-canvas]');
const SAMPLE_HASH = sha3_256(new TextEncoder().encode('lattice specimen'));
let cardMode = 'specimen';

function cardData() {
  const r = state.report;
  const k = state.key;
  const s = state.seal;
  const foot = `${CONFIG.ticker}  ${CONFIG.siteUrl}`;
  if (k && s && s.ok) {
    const sc = SCHEMES[k.scheme];
    const id = sealId(k.fpHex);
    const co = state.cosign && state.cosign.ok;
    return {
      mode: 'sealed',
      title: 'Sealed.',
      sub: r && r.onCurve && r.firstSeen
        ? `${fmtInt(r.days)} days in the open. Sealed ${fmtDate(new Date(s.issued))}.`
        : `A post-quantum key, forged in the browser on ${fmtDate(new Date(s.issued))}.`,
      rows: [
        ['Wallet', s.wallet ? shortAddr(s.wallet, 5) : 'Unbound', s.wallet ? '' : 'dim'],
        ['Scheme', `${sc.name}, ${sc.standard.replace('NIST ', '')}`],
        ['Fingerprint', groupHex(k.fpHex, 4, 4)],
        ['Co-signed', co ? 'Yes, by the wallet' : 'No', co ? '' : 'dim'],
        ['NIST level', `${sc.level} of 5`],
      ],
      caption: `${sc.name} lattice, seal ${id}`,
      id: `Seal ${id}`,
      hash: k.fingerprint,
      foot,
    };
  }
  if (r && r.onCurve) {
    return {
      mode: 'exposed',
      title: 'Exposed.',
      sub: r.firstSeen ? `My Solana key has been in the open for ${fmtInt(r.days)}\u00a0days.` : 'My Solana key is public the moment it receives anything.',
      rows: [
        ['Wallet', shortAddr(r.address, 5)],
        ['In the open since', r.firstSeen ? fmtDate(r.firstSeen) : 'Not yet on-chain'],
        ['Signatures made', `${fmtInt(r.signatures)}${r.capped ? '+' : ''}`],
        ['Scheme', 'Ed25519'],
        ['Survives Shor', 'No', 'red'],
      ],
      caption: 'Ed25519 key under strain',
      id: 'Exposure report',
      hash: sha3_256(r.bytes),
      foot,
    };
  }
  return {
    mode: 'specimen',
    title: 'Specimen.',
    sub: 'Sample data. Scan a wallet or forge a key to make your own card.',
    rows: [
      ['Wallet', 'Sample', 'dim'],
      ['Scheme', 'ML-DSA-65, FIPS 204'],
      ['Fingerprint', groupHex(Array.from(SAMPLE_HASH, (b) => b.toString(16).padStart(2, '0')).join(''), 4, 4)],
      ['Co-signed', 'No', 'dim'],
      ['NIST level', '3 of 5'],
    ],
    caption: 'ML-DSA-65 lattice, specimen',
    id: 'Specimen',
    hash: SAMPLE_HASH,
    foot,
  };
}

let cardQueued = false;
function renderCard() {
  if (cardQueued) return;
  cardQueued = true;
  requestAnimationFrame(async () => {
    cardQueued = false;
    const d = cardData();
    cardMode = d.mode;
    d.theme = THEME;
    await drawCard(cardCanvas, d, 2);
    cardCanvas.setAttribute('aria-label', `${d.title} ${d.sub}`);
  });
}

function shareText() {
  const r = state.report;
  const k = state.key;
  if (cardMode === 'sealed') {
    const sc = SCHEMES[k.scheme];
    const days = r && r.onCurve && r.firstSeen ? `My Solana key spent ${fmtInt(r.days)} days in the open. ` : '';
    return `${days}Today I sealed it with a post-quantum ${sc.name} key, forged in my browser.\n\nBuilt for the day after Q-day. ${CONFIG.ticker}\n${CONFIG.siteUrl}`;
  }
  return `My Solana key has been in the open for ${fmtInt(r.days)} days. A big enough quantum computer turns it back into my private key.\n\nCheck yours: ${CONFIG.siteUrl} ${CONFIG.ticker}`;
}

$('[data-share-x]').addEventListener('click', () => {
  window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(shareText())}`, '_blank', 'noopener');
});
$('[data-copy-img]').addEventListener('click', async () => {
  try {
    const blob = await canvasBlob(cardCanvas);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    toast('Image copied. Paste it into your post.');
  } catch {
    toast('This browser can’t copy images. Downloading instead.');
    downloadImage();
  }
});
async function downloadImage() {
  const blob = await canvasBlob(cardCanvas);
  const name = cardMode === 'sealed' ? `lattice-seal-${sealId(state.key.fpHex)}.png` : `lattice-exposure-${shortAddr(state.report.address, 4).replace('…', '-')}.png`;
  download(name, blob);
}
$('[data-dl-img]').addEventListener('click', downloadImage);
$('[data-dl-seal]').addEventListener('click', () => {
  if (!state.seal) return;
  download(`lattice-seal-${sealId(state.key.fpHex)}.json`, JSON.stringify(sealFile(state), null, 2));
  toast('Seal file saved. It is public, share it freely.');
});
function downloadKeyfile() {
  if (!state.key || !state.seal) {
    tty.line(T.dim('no key yet. run forge first.'));
    return;
  }
  download(`lattice-key-${sealId(state.key.fpHex)}.json`, JSON.stringify(keyFile(state.key), null, 2));
  tty.line(T.kv('keyfile', T.v('saved') + T.dim('  keep it offline')));
  toast('Keyfile saved. Keep it offline.');
}
$$('[data-keyfile]').forEach((b) => b.addEventListener('click', downloadKeyfile));

/* ---------------- co-sign ---------------- */
function cosignStatus(msg, cls = '') {
  const el = $('[data-cosign-status]');
  el.textContent = msg;
  el.className = `act-note act-status mono ${cls}`;
}
async function doCosign({ fromTty = false } = {}) {
  if (!state.key || !state.seal) {
    cosignStatus('Forge a key first.');
    if (fromTty) tty.line(T.dim('forge a key first.'));
    return;
  }
  if (!fromTty) tty.cmd('cosign');
  try {
    cosignStatus('Waiting for your wallet…');
    const { address, provider } = await connect();
    tty.line(T.kv('wallet', T.v(`${provider.name} ${shortAddr(address)}`)));
    let holder = false;
    if (CONFIG.mint) {
      try {
        const bal = await getTokenBalance(address, CONFIG.mint);
        holder = bal >= CONFIG.holderMin;
        tty.line(T.kv('holder', holder ? T.ok(`✓ ${fmtInt(bal)} ${CONFIG.ticker}`) : T.dim(`no ${CONFIG.ticker} in this wallet`)));
      } catch {
        tty.line(T.kv('holder', T.dim('could not read token balance')));
      }
    }
    if (!state.report || state.report.address !== address) await doScan(address, { quiet: true });
    const up = SCHEMES[state.key.scheme].upgrade;
    if (holder && up) {
      tty.line(T.kv('level', T.ok('5 unlocked') + T.dim(`  reforging as ${SCHEMES[up].name}`)));
      await doForge(up, { fromTty: true });
    } else if (state.seal.wallet !== address) {
      const seal = await sealKey(state.key, address);
      set({ seal });
      tty.line(T.kv('pledge', T.v(`rebound to ${shortAddr(address)}`)));
    }
    cosignStatus('Sign the pledge in your wallet. It is a message, not a transaction.');
    const sig = await signMessage(provider, state.seal.pledge);
    const b58 = sigToB58(sig);
    const ok = verifyCosign(address, state.seal.pledge, b58);
    set({ cosign: { wallet: address, signature: b58, ok }, holder });
    tty.line(T.kv('cosign', ok ? T.ok('✓ ed25519 signature matches the wallet') : T.err('✕ signature does not match the wallet')));
    cosignStatus(ok ? `Co-signed by ${shortAddr(address)}. Both keys now vouch for each other.` : 'The wallet signature did not verify.', ok ? 'ok' : 'err');
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    cosignStatus(msg, 'err');
    tty.line(T.err(`cosign: ${msg}`));
  }
}
$('[data-cosign]').addEventListener('click', () => doCosign());

/* ---------------- §2 runnable code ---------------- */
let demoKey = null;
const outLine = (k, v) => `<b>→</b> ${T.esc(k.padEnd(11))}<b>${T.esc(v)}</b>`;
const RUNS = {
  async scan() {
    const addr = state.report ? state.report.address : sequence.address;
    const t = performance.now();
    const info = inspectAddress(addr);
    const ms = performance.now() - t;
    const hex = Array.from(info.bytes.slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join(' ');
    const lines = [
      outLine('address', shortAddr(addr, 6) + (state.report ? '' : '  (sample)')),
      outLine('bytes', `32  [${hex} …]`),
      outLine('on curve', info.onCurve ? 'true, a real Ed25519 public key' : 'false, no private key exists'),
      outLine('took', fmtMs(ms)),
    ];
    if (state.report && state.report.firstSeen) lines.push(outLine('first sig', `${fmtDate(state.report.firstSeen)}, ${fmtInt(state.report.days)} days ago`));
    else lines.push('  scan a wallet above for its history');
    return lines;
  },
  async forge() {
    demoKey = await forgeKey('ml-dsa-65');
    return [
      outLine('publicKey', `${fmtInt(demoKey.publicKey.length)} bytes`),
      outLine('secretKey', `${fmtInt(demoKey.secretKey.length)} bytes, stays here`),
      outLine('keygen', fmtMs(demoKey.ms)),
      outLine('sha3-256', demoKey.fpHex.slice(0, 24) + '…'),
    ];
  },
  async seal() {
    if (!demoKey) demoKey = await forgeKey('ml-dsa-65');
    const seal = await sealKey(demoKey, null);
    return [
      outLine('signature', `${fmtInt(seal.sig.length)} bytes`),
      outLine('sign', fmtMs(seal.signMs)),
      outLine('verify', `${seal.ok} (${fmtMs(seal.verifyMs)})`),
    ];
  },
};
$$('[data-run]').forEach((btn) =>
  btn.addEventListener('click', async () => {
    const id = btn.dataset.run;
    const out = $(`[data-out="${id}"]`);
    btn.disabled = true;
    btn.textContent = 'Running';
    try {
      const lines = await RUNS[id]();
      out.innerHTML = lines.join('\n');
    } catch (e) {
      out.innerHTML = `<span class="err">${T.esc(e.message)}</span>`;
    }
    out.hidden = false;
    out.style.animation = 'none';
    void out.offsetWidth;
    out.style.animation = '';
    btn.disabled = false;
    btn.textContent = 'Run again';
  }),
);

/* ---------------- sections ---------------- */
const seqVal = $('[data-seq-v]');
const seqKey = $('[data-seq-k]');
const SEQ_READOUT = [
  ['Ed25519 public key', '32 bytes', ''],
  ['Classical cost to recover a', '2<sup>128</sup> steps', ''],
  ['With Shor’s algorithm', 'minutes', 'red'],
  ['Known quantum shortcut for lattices', 'none', ''],
];
const sequence = new Sequence($('#exposure'), (step) => {
  $$('[data-seq-steps] li').forEach((li, i) => {
    li.classList.toggle('on', i === step);
    li.classList.toggle('past', i < step);
  });
  const [k, v, cls] = SEQ_READOUT[step];
  seqKey.textContent = k;
  seqVal.innerHTML = v;
  seqVal.className = cls;
});

new Space($('#space'), () => state.key);

const verifier = new Verifier($('#verify'), {
  getMine: () => (state.key && state.seal ? sealFile(state) : null),
  makeSample: async () => {
    const key = await forgeKey('ml-dsa-65');
    const seal = await sealKey(key, null);
    return sealFile({ key, seal, cosign: null });
  },
});

/* ---------------- state → UI ---------------- */
function updateUI() {
  const sealed = !!(state.seal && state.seal.ok);
  const k = state.key;
  const r = state.report;
  const sc = k ? SCHEMES[k.scheme] : null;

  $('.scope').classList.toggle('sealed', sealed);
  $('.companion').classList.toggle('sealed', sealed);
  $('[data-companion-text]').textContent = sealed ? `Your key, sealed (${sc.name})` : 'Your key, exposed';
  const chip = $('[data-keychip]');
  chip.dataset.state = sealed ? 'sealed' : 'exposed';
  $('[data-keychip-text]').textContent = sealed ? `${sc.name} key, sealed` : 'Ed25519 key, exposed';

  $('[data-fig-caption]').textContent = sealed
    ? `${sc.name} key ${sealId(k.fpHex)}. No strain, so no colour.`
    : r && r.onCurve
      ? `Key ${shortAddr(r.address)} between crossed polarizers. Strain shows up as colour.`
      : 'An Ed25519 key between crossed polarizers. Strain shows up as colour.';
  const annoA = $('[data-anno-a]');
  const annoB = $('[data-anno-b]');
  if (sealed) {
    const fam = k.scheme.startsWith('falcon') ? 'NTRU lattice<br />q = 12,289' : 'Module-LWE<br />q = 8,380,417';
    annoA.innerHTML = fam;
    annoB.innerHTML = `public key<br />${fmtInt(k.publicKey.length)} bytes`;
  } else {
    annoA.innerHTML = 'Curve25519<br />p = 2<sup>255</sup> − 19';
    annoB.innerHTML = 'public key<br />32 bytes';
  }

  // seal section
  const canShare = sealed || (r && r.onCurve);
  ['[data-share-x]', '[data-copy-img]', '[data-dl-img]'].forEach((s) => ($(s).disabled = !canShare));
  ['[data-dl-seal]', '[data-cosign]'].forEach((s) => ($(s).disabled = !sealed));
  $$('[data-keyfile]').forEach((b) => (b.disabled = !sealed));
  const note = $('[data-seal-note]');
  if (sealed) {
    note.innerHTML = `<em>Seal ${sealId(k.fpHex)}.</em> Signed by your ${sc.name} key and verified in ${fmtMs(state.seal.verifyMs)}.`;
    $('[data-seal-lede]').textContent = 'Your new lattice key signed a pledge that names your wallet, and LATTICE verified it. Post the card, keep the files, and co-sign if you want proof that both keys are yours.';
  } else if (r && r.onCurve) {
    note.innerHTML = '<em>Exposure card.</em> Forge a key to turn it into a seal.';
  }
  $('[data-vault-key]').textContent = sealed ? `Seal ${sealId(k.fpHex)}, ${sc.name}` : 'Not forged';
  $('[data-flow-scheme]').textContent = sealed ? sc.name : SCHEMES[state.scheme].name;
  $('[data-chamber-caption]').textContent = sealed
    ? `Your ${sc.name} key, sealed. When the vault opens, this is the key that unlocks it.`
    : 'Your key as it is today. It can enter the vault once it is sealed.';
  verifier.enableMine(sealed);
  if (!reportEl.hidden) renderReport();
  renderCard();
}
subscribe((s, patch) => {
  if ('scanning' in patch && Object.keys(patch).length === 1) return;
  updateUI();
});

/* ---------------- live readouts ---------------- */
let heroVisible = true;
new IntersectionObserver(([e]) => (heroVisible = e.isIntersecting)).observe(heroEl);
const needle = $('[data-needle]');
const thetaEl = $('[data-theta]');
const strainEl = $('[data-stat-strain]');
const defectsEl = $('[data-stat-defects]');
const nodesEl = $('[data-stat-nodes]');
const markEl = $('[data-colorbar-mark]');
let lastUI = 0;
function readouts(now) {
  requestAnimationFrame(readouts);
  if (!heroVisible || !specimen || now - lastUI < 66) return;
  lastUI = now;
  const th = specimen.theta();
  thetaEl.textContent = th.toFixed(1);
  needle.setAttribute('transform', `rotate(${th.toFixed(2)} 500 500)`);
  const L = specimen.lockAmount();
  const strain = specimen.strain * (1 - L) * (1 + specimen.agitate * 0.8);
  strainEl.textContent = strain.toFixed(3);
  defectsEl.textContent = String(Math.round(specimen.defectCount * (1 - L)));
  nodesEl.textContent = String(Math.round(specimen.cubicCount + (specimen.count - specimen.cubicCount) * L));
  markEl.style.left = `${clamp((strain * 420) / 1200, 0, 1) * 100}%`;
}
requestAnimationFrame(readouts);

async function slotTicker() {
  const el = $('[data-slot]');
  try {
    const s = await getSlot();
    el.textContent = fmtInt(s);
  } catch {
    el.textContent = 'unreachable';
  }
}
slotTicker();
setInterval(() => {
  if (!document.hidden && heroVisible) slotTicker();
}, 15000);

if (CONFIG.vaultFund) {
  const f = $('[data-fund]');
  f.hidden = false;
  getSolBalance(CONFIG.vaultFund)
    .then((v) => ($('[data-fund-sol]').textContent = v.toLocaleString('en-US', { maximumFractionDigits: 2 })))
    .catch(() => ($('[data-fund-sol]').textContent = '—'));
}

updateUI();
boot();
