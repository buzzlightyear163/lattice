import { ed25519 } from '@noble/curves/ed25519.js';
import { CONFIG } from './config.js';
import { b58decode } from './lib/base58.js';

const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PJnqhaA8gGK6W6w';

let preferred = null; // the endpoint that answered last

function endpoints() {
  const list = [];
  if (CONFIG.rpcProxy && location.protocol.startsWith('http')) list.push(CONFIG.rpcProxy);
  list.push(...CONFIG.rpc);
  if (preferred && list.includes(preferred)) return [preferred, ...list.filter((e) => e !== preferred)];
  return list;
}

export function endpointLabel(e) {
  if (!e) return 'rpc';
  if (e.startsWith('/')) return 'lattice proxy';
  try {
    return new URL(e).host;
  } catch {
    return e;
  }
}

/** JSON-RPC call with endpoint fallback. onEvent receives { endpoint, ms, ok } per attempt. */
export async function rpc(method, params, onEvent) {
  let lastErr = null;
  for (const ep of endpoints()) {
    const t = performance.now();
    try {
      const r = await fetch(ep, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(10000),
      });
      if (r.status === 429) throw new Error('rate limited');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      if (j.error) throw new Error(j.error.message || 'RPC error');
      preferred = ep;
      onEvent && onEvent({ endpoint: ep, ms: performance.now() - t, ok: true });
      return j.result;
    } catch (e) {
      lastErr = e;
      onEvent && onEvent({ endpoint: ep, ms: performance.now() - t, ok: false, error: e.message });
    }
  }
  throw new Error(lastErr ? lastErr.message : 'No RPC endpoint answered');
}

/** Validates a Solana address and tells whether it is a real Ed25519 public key (on the curve). */
export function inspectAddress(address) {
  const a = (address || '').trim();
  const bytes = b58decode(a);
  if (!bytes || bytes.length !== 32) return { valid: false, address: a };
  let onCurve = false;
  try {
    ed25519.Point.fromBytes(bytes);
    onCurve = true;
  } catch {
    onCurve = false;
  }
  return { valid: true, address: a, bytes, onCurve };
}

/**
 * Builds the exposure report from public chain data.
 * log(type, payload) streams progress for the terminal.
 */
export async function scan(address, log = () => {}) {
  const info = inspectAddress(address);
  if (!info.valid) throw new Error('That is not a Solana address. It should be 32 bytes in base58.');
  log('decode', info);

  const ev = (label) => (e) => log('rpc', { label, ...e });

  const [lamports, tokensA, tokensB] = await Promise.all([
    rpc('getBalance', [info.address, { commitment: 'confirmed' }], ev('getBalance')).then((r) => r.value),
    rpc('getTokenAccountsByOwner', [info.address, { programId: TOKEN_PROGRAM }, { encoding: 'jsonParsed' }], ev('getTokenAccounts')).catch(() => ({ value: [] })),
    rpc('getTokenAccountsByOwner', [info.address, { programId: TOKEN_2022 }, { encoding: 'jsonParsed' }], ev('getTokenAccounts 2022')).catch(() => ({ value: [] })),
  ]);
  const accounts = [...(tokensA.value || []), ...(tokensB.value || [])];
  const tokens = accounts.filter((a) => {
    const amt = a.account && a.account.data && a.account.data.parsed && a.account.data.parsed.info && a.account.data.parsed.info.tokenAmount;
    return amt && Number(amt.amount) > 0;
  }).length;
  log('balance', { lamports, tokens });

  let before = undefined;
  let count = 0;
  let oldest = null;
  let newest = null;
  let capped = false;
  for (let page = 0; page < CONFIG.signaturePages; page++) {
    const opts = { limit: 1000, commitment: 'confirmed' };
    if (before) opts.before = before;
    const sigs = await rpc('getSignaturesForAddress', [info.address, opts], ev(`getSignatures p${page + 1}`));
    if (!sigs.length) break;
    if (!newest) newest = sigs[0];
    count += sigs.length;
    oldest = sigs[sigs.length - 1];
    log('page', { page: page + 1, n: sigs.length, total: count });
    if (sigs.length < 1000) break;
    before = oldest.signature;
    if (page === CONFIG.signaturePages - 1) capped = true;
  }

  const firstTime = oldest && oldest.blockTime ? oldest.blockTime * 1000 : null;
  const lastTime = newest && newest.blockTime ? newest.blockTime * 1000 : null;
  const days = firstTime ? Math.max(0, Math.floor((Date.now() - firstTime) / 86400000)) : 0;

  return {
    address: info.address,
    onCurve: info.onCurve,
    bytes: info.bytes,
    lamports,
    sol: lamports / 1e9,
    tokens,
    signatures: count,
    capped,
    firstSeen: firstTime ? new Date(firstTime) : null,
    lastSeen: lastTime ? new Date(lastTime) : null,
    days,
    scannedAt: new Date(),
  };
}

export async function getSlot() {
  return rpc('getSlot', [{ commitment: 'confirmed' }]);
}

export async function getSolBalance(address) {
  const r = await rpc('getBalance', [address, { commitment: 'confirmed' }]);
  return r.value / 1e9;
}

export async function getTokenBalance(owner, mint) {
  const r = await rpc('getTokenAccountsByOwner', [owner, { mint }, { encoding: 'jsonParsed' }]);
  let sum = 0;
  for (const a of r.value || []) {
    const amt = a.account.data.parsed.info.tokenAmount;
    sum += Number(amt.uiAmountString || amt.uiAmount || 0);
  }
  return sum;
}
