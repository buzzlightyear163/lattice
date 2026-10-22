# LATTICE ($LATTICE)

**Built for the day after Q-day.**

A Solana address *is* its Ed25519 public key, and a large enough quantum computer can turn that key back into the private key (Shor's algorithm). LATTICE:

1. **Scans** any wallet: checks the address is a real point on Curve25519 and reads how long the key has been on-chain, its signatures, SOL and tokens (public RPC data).
2. **Forges** a real post-quantum key pair in the browser (Web Worker): **ML-DSA-65** (NIST FIPS 204) by default, **Falcon-512** as an option (the scheme Solana's validator clients prototyped in 2026). Holders get Level 5 (ML-DSA-87 / Falcon-1024).
3. **Seals** it: the new key signs a pledge naming the wallet, and the signature is verified on the spot. The wallet can co-sign the same pledge (signMessage only, never a transaction).
4. Produces a **shareable seal card** (PNG), a public **seal file** and a secret **keyfile**. Anyone can verify a seal in §5.

What is real: key generation, signing, verification, co-signature checks, exposure data.
What is not live: the on-chain vault (it is shown as "in testing, deposits closed").

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # outputs dist/
npm run preview    # serves dist/ with the RPC proxy
npm run build:file # one self-contained preview/index.html (double-click to open)
```

## Deploy (Vercel)

Import the repo in Vercel. It detects Vite automatically. `api/rpc.js` becomes a serverless function at `/api/rpc`, a read-only proxy that only allows a short list of RPC methods.

Optional but recommended: add an env variable **`RPC_URL`** (Helius, Triton, QuickNode…) for faster and more reliable scans. Without it the proxy uses the public Solana endpoints.

## Before launch: edit `src/config.js`

| Field | What |
|---|---|
| `theme` | `'paper'` (white lab paper with black eyepieces, default) or `'ink'` (all black). Preview either with `?theme=ink` |
| `siteUrl` | your domain, shown on the seal card and in share posts |
| `x` | your X profile URL |
| `buyUrl` | pump.fun link |
| `mint` | the $LATTICE contract address. Turns on the CA row, the copy button and Level 5 holder seals |
| `holderMin` | tokens needed for Level 5 |
| `vaultFund` | public wallet for creator fees; its balance is shown live in §7 |

`public/og.png` is the link preview image used on X.

## Map

```
index.html            all sections and copy
src/main.js           wiring: state, scan, forge, co-sign, card, terminal commands
src/specimen.js       the WebGL crystal (exposed → lock wave → sealed), docks into [data-specimen-slot]
src/lib/michel.js     Michel-Lévy interference colours, computed from physics
src/crypto.worker.js  ML-DSA + Falcon via @noble/post-quantum
src/forge.js          worker calls, pledge, seal/key files, seal verification
src/rpc.js            exposure scan with endpoint fallback
src/sealcard.js       1200×675 share card renderer
src/sequence.js       §1 pinned scroll sequence (bytes → curve → Shor → lattice)
src/space.js          §3 key sizes to scale
src/verify.js         §5 seal verifier
src/terminal.js       the terminal (try: help, scan <addr>, forge falcon-512, status)
api/rpc.js            Vercel function; api/_proxy.js shared with the Vite dev server
```

Notes: Falcon in @noble/post-quantum follows Round 3; the final FN-DSA standard may differ. Nothing on the site is financial advice.
