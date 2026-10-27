// Everything you need to edit before launch lives here.
export const CONFIG = {
  name: 'LATTICE',
  ticker: '$LATTICE',
  tagline: 'Built for the day after Q-day.',

  // Shown on the seal card footer and in share posts.
  siteUrl: 'x.com/LatticeKey', // swap for the domain once it's bought

  // Look: 'ink' (black) or 'paper' (white lab paper with dark eyepieces).
  // You can also preview either one with ?theme=paper or ?theme=ink in the URL.
  theme: 'paper',

  // Links
  x: 'https://x.com/LatticeKey',
  buyUrl: 'https://pump.fun/coin/7UVcUTcrtdWLbW1awDeu3vDVvYUNudShdyfWJfrpump',

  // Contract address (mint) of $LATTICE. Leave empty until it exists.
  // When set, holders who co-sign with their wallet unlock Level 5 seals
  // (ML-DSA-87 or Falcon-1024, depending on the chosen scheme).
  mint: '7UVcUTcrtdWLbW1awDeu3vDVvYUNudShdyfWJfrpump',
  holderMin: 1, // whole tokens required for Level 5

  // Public wallet that receives creator fees for the vault fund. Balance is read live.
  vaultFund: '',

  // RPC. The site first calls its own /api/rpc proxy (Vercel function + Vite dev server),
  // then falls back to these endpoints straight from the browser.
  // For speed, set RPC_URL (Helius, Triton…) as an env variable on Vercel instead of editing this.
  rpcProxy: '/api/rpc',
  rpc: [
    'https://solana-rpc.publicnode.com',
    'https://api.mainnet-beta.solana.com',
  ],

  // How many pages of 1,000 signatures to walk back when looking for a wallet's first signature.
  signaturePages: 4,
};
