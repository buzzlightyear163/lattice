// Tiny global store. Everything on the page reads from here.
const listeners = new Set();

export const state = {
  scheme: 'ml-dsa-65', // chosen base scheme
  wallet: null, // scanned / bound address (base58)
  report: null, // exposure report from rpc.scan
  scanning: false,
  forging: false,
  key: null, // { scheme, publicKey, secretKey, fingerprint, ms }
  seal: null, // { pledge, sig, signMs, verifyMs, ok, issued }
  cosign: null, // { wallet, signature, ok }
  holder: false,
  workerReady: null, // ms for warmup
};

export function set(patch) {
  Object.assign(state, patch);
  for (const fn of listeners) fn(state, patch);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 0 idle, 1 scanned, 2 sealed */
export const phase = () => (state.seal && state.seal.ok ? 2 : state.report ? 1 : 0);
