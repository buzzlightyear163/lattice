// Shared read-only Solana RPC proxy.
// Used by the Vercel function (api/rpc.js) and by the Vite dev/preview server (vite.config.js),
// so the browser never depends on a public RPC accepting cross-origin requests.
// Set RPC_URL (e.g. a Helius or Triton URL) in your Vercel env for speed and higher limits.

const ALLOWED = new Set([
  'getBalance',
  'getSignaturesForAddress',
  'getTokenAccountsByOwner',
  'getSlot',
  'getAccountInfo',
  'getEpochInfo',
]);

const PUBLIC_UPSTREAMS = [
  'https://api.mainnet-beta.solana.com',
  'https://solana-rpc.publicnode.com',
];

export async function proxyRpc(raw) {
  let payload;
  try {
    payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return reply(400, { error: 'Body must be JSON-RPC.' });
  }
  const calls = Array.isArray(payload) ? payload : [payload];
  if (!calls.length || calls.length > 4) return reply(400, { error: 'Send 1 to 4 calls.' });
  for (const c of calls) {
    if (!c || typeof c.method !== 'string' || !ALLOWED.has(c.method)) {
      return reply(403, { error: `Method not allowed: ${c && c.method}` });
    }
  }

  const env = typeof process !== 'undefined' ? process.env : {};
  const upstreams = [env.RPC_URL, ...PUBLIC_UPSTREAMS].filter(Boolean);
  let last = 'no upstream';
  for (const url of upstreams) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(9000),
      });
      const text = await r.text();
      if (r.ok) return { status: 200, body: text };
      last = `${new URL(url).host} answered ${r.status}`;
    } catch (e) {
      last = `${new URL(url).host}: ${e && e.message ? e.message : 'failed'}`;
    }
  }
  return reply(502, { error: 'All RPC upstreams failed.', detail: last });
}

function reply(status, obj) {
  return { status, body: JSON.stringify(obj) };
}
