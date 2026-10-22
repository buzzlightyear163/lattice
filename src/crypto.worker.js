// All post-quantum work happens here, off the main thread, on the visitor's device.
import { ml_dsa65, ml_dsa87 } from '@noble/post-quantum/ml-dsa.js';
import { falcon512, falcon1024 } from '@noble/post-quantum/falcon.js';
import { sha3_256 } from '@noble/hashes/sha3.js';

const ALG = {
  'ml-dsa-65': ml_dsa65,
  'ml-dsa-87': ml_dsa87,
  'falcon-512': falcon512,
  'falcon-1024': falcon1024,
};

const now = () => performance.now();

const ops = {
  warmup() {
    const t = now();
    const k = ml_dsa65.keygen();
    const m = new TextEncoder().encode('warmup');
    const s = ml_dsa65.sign(m, k.secretKey);
    ml_dsa65.verify(s, m, k.publicKey);
    return { result: { ms: now() - t } };
  },
  keygen({ scheme }) {
    const alg = ALG[scheme];
    if (!alg) throw new Error(`Unknown scheme ${scheme}`);
    const seed = crypto.getRandomValues(new Uint8Array(scheme.startsWith('falcon') ? 48 : 32));
    const t = now();
    const keys = alg.keygen(seed);
    const ms = now() - t;
    // copies: the library may return views into one shared buffer
    const publicKey = keys.publicKey.slice();
    const secretKey = keys.secretKey.slice();
    seed.fill(0);
    const fingerprint = sha3_256(publicKey).slice();
    return {
      result: { publicKey, secretKey, fingerprint, ms, seedBytes: seed.length },
      transfer: [publicKey.buffer, secretKey.buffer, fingerprint.buffer],
    };
  },
  sign({ scheme, msg, secretKey }) {
    const t = now();
    const sig = ALG[scheme].sign(msg, secretKey).slice();
    secretKey.fill(0);
    return { result: { sig, ms: now() - t }, transfer: [sig.buffer] };
  },
  verify({ scheme, sig, msg, publicKey }) {
    const t = now();
    let valid = false;
    try {
      valid = ALG[scheme].verify(sig, msg, publicKey);
    } catch {
      valid = false;
    }
    return { result: { valid, ms: now() - t } };
  },
};

self.onmessage = (e) => {
  const { id, op, data } = e.data;
  try {
    const { result, transfer = [] } = ops[op](data || {});
    self.postMessage({ id, ok: true, result }, transfer);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
  }
};
