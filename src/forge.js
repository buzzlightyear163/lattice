import { sha3_256 } from '@noble/hashes/sha3.js';
import { ed25519 } from '@noble/curves/ed25519.js';
import { SCHEMES } from './lib/schemes.js';
import { toHex, toB64, fromB64 } from './lib/format.js';
import { b58decode, b58encode } from './lib/base58.js';
import CryptoWorker from './crypto.worker.js?worker&inline';

let worker = null;
let seq = 0;
const pending = new Map();

function getWorker() {
  if (worker) return worker;
  worker = new CryptoWorker();
  worker.onmessage = (e) => {
    const { id, ok, result, error } = e.data;
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    ok ? p.resolve(result) : p.reject(new Error(error));
  };
  worker.onerror = (e) => {
    for (const p of pending.values()) p.reject(new Error(e.message || 'Worker failed'));
    pending.clear();
  };
  return worker;
}

function call(op, data, transfer = []) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, op, data }, transfer);
  });
}

export const warmup = () => call('warmup');

export async function forgeKey(scheme) {
  const r = await call('keygen', { scheme });
  return {
    scheme,
    publicKey: r.publicKey,
    secretKey: r.secretKey,
    fingerprint: r.fingerprint,
    fpHex: toHex(r.fingerprint),
    ms: r.ms,
    seedBytes: r.seedBytes,
    created: new Date(),
  };
}

export function buildPledge({ wallet, scheme, fpHex, issued }) {
  const s = SCHEMES[scheme];
  return [
    'LATTICE pledge v1',
    `wallet: ${wallet || 'unbound'}`,
    `scheme: ${s.name} (${s.standard})`,
    `lattice-key: sha3-256:${fpHex}`,
    `issued: ${issued}`,
    'This lattice key succeeds the Ed25519 key above, for the day after Q-day.',
  ].join('\n');
}

const enc = new TextEncoder();

/** Signs the pledge with the lattice key and verifies it right away. */
export async function sealKey(key, wallet) {
  const issued = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const pledge = buildPledge({ wallet, scheme: key.scheme, fpHex: key.fpHex, issued });
  const msg = enc.encode(pledge);
  const sk = key.secretKey.slice(); // keep our copy; the worker gets a transferable one
  const s = await call('sign', { scheme: key.scheme, msg, secretKey: sk }, [sk.buffer]);
  const v = await call('verify', { scheme: key.scheme, sig: s.sig, msg, publicKey: key.publicKey });
  return { pledge, issued, sig: s.sig, signMs: s.ms, verifyMs: v.ms, ok: v.valid, wallet: wallet || null };
}

export function sealId(fpHex) {
  return `${fpHex.slice(0, 4)}-${fpHex.slice(4, 8)}`.toUpperCase();
}

export function sealFile({ key, seal, cosign }) {
  return {
    lattice: 'seal/v1',
    scheme: key.scheme,
    wallet: seal.wallet,
    issued: seal.issued,
    fingerprint: key.fpHex,
    pledge: seal.pledge,
    publicKey: toB64(key.publicKey),
    signature: toB64(seal.sig),
    cosignature: cosign && cosign.ok ? cosign.signature : null,
    note: 'Public. Anyone can verify this seal. It contains no secret.',
  };
}

export function keyFile(key) {
  return {
    lattice: 'key/v1',
    warning: 'SECRET. Anyone holding this file can sign as this lattice key. Keep it offline.',
    scheme: key.scheme,
    fingerprint: key.fpHex,
    created: key.created.toISOString(),
    publicKey: toB64(key.publicKey),
    secretKey: toB64(key.secretKey),
  };
}

/** Verifies an Ed25519 co-signature of the pledge from the wallet that owns `wallet`. */
export function verifyCosign(wallet, pledge, signatureB58) {
  try {
    const pk = b58decode(wallet);
    const sig = b58decode(signatureB58);
    if (!pk || pk.length !== 32 || !sig || sig.length !== 64) return false;
    return ed25519.verify(sig, enc.encode(pledge), pk);
  } catch {
    return false;
  }
}

export const sigToB58 = (bytes) => b58encode(bytes);

/**
 * Full check of a seal file. Returns a list of steps { label, ok, detail } and an overall result.
 */
export async function verifySeal(obj) {
  const steps = [];
  const push = (label, ok, detail = '') => steps.push({ label, ok, detail });
  if (!obj || obj.lattice !== 'seal/v1') {
    push('Seal format', false, 'Not a LATTICE seal file (expected "lattice": "seal/v1").');
    return { ok: false, steps };
  }
  const s = SCHEMES[obj.scheme];
  if (!s) {
    push('Scheme', false, `Unknown scheme "${obj.scheme}".`);
    return { ok: false, steps };
  }
  push('Scheme', true, `${s.name}, ${s.standard}`);
  let pk, sig;
  try {
    pk = fromB64(obj.publicKey);
    sig = fromB64(obj.signature);
  } catch {
    push('Decode', false, 'Public key or signature is not valid base64.');
    return { ok: false, steps };
  }
  push('Public key', pk.length === s.pk, `${pk.length} bytes`);
  const fp = toHex(sha3_256(pk));
  push('Fingerprint', fp === obj.fingerprint && obj.pledge.includes(`sha3-256:${fp}`), `sha3-256 ${fp.slice(0, 16)}…`);
  const bound = obj.wallet ? obj.pledge.includes(`wallet: ${obj.wallet}`) : obj.pledge.includes('wallet: unbound');
  push('Pledge binding', bound, obj.wallet ? `wallet ${obj.wallet.slice(0, 4)}…${obj.wallet.slice(-4)}` : 'unbound key');
  const v = await call('verify', { scheme: obj.scheme, sig, msg: enc.encode(obj.pledge), publicKey: pk });
  push(`${s.name} signature`, v.valid, `${sig.length} bytes, verified in ${v.ms.toFixed(2)} ms`);
  if (obj.cosignature) {
    const ok = verifyCosign(obj.wallet, obj.pledge, obj.cosignature);
    push('Ed25519 co-signature', ok, ok ? 'signed by the wallet itself' : 'does not match the wallet');
  } else {
    push('Ed25519 co-signature', null, 'not co-signed');
  }
  const ok = steps.every((x) => x.ok !== false);
  return { ok, steps };
}
