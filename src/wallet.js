// Optional wallet co-signature. Uses the injected provider (Phantom, Solflare, Backpack).
// It only ever asks for signMessage — never a transaction.

export function getProvider() {
  const w = window;
  if (w.phantom && w.phantom.solana && w.phantom.solana.isPhantom) return { p: w.phantom.solana, name: 'Phantom' };
  if (w.solflare && w.solflare.isSolflare) return { p: w.solflare, name: 'Solflare' };
  if (w.backpack && w.backpack.solana) return { p: w.backpack.solana, name: 'Backpack' };
  if (w.backpack && w.backpack.signMessage) return { p: w.backpack, name: 'Backpack' };
  if (w.solana && w.solana.signMessage) return { p: w.solana, name: 'Wallet' };
  return null;
}

export async function connect() {
  const prov = getProvider();
  if (!prov) throw new Error('No Solana wallet found in this browser. Install Phantom, Solflare or Backpack to co-sign.');
  const res = await prov.p.connect();
  const pk = (res && res.publicKey) || prov.p.publicKey;
  if (!pk) throw new Error('The wallet did not share an address.');
  return { address: pk.toBase58 ? pk.toBase58() : String(pk), provider: prov };
}

export async function signMessage(provider, text) {
  const bytes = new TextEncoder().encode(text);
  const out = await provider.p.signMessage(bytes, 'utf8');
  const sig = out && out.signature ? out.signature : out;
  return sig instanceof Uint8Array ? sig : new Uint8Array(sig);
}
