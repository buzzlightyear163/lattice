// The signature schemes LATTICE can forge. Sizes are the real byte lengths from @noble/post-quantum.
export const SCHEMES = {
  'ml-dsa-65': {
    id: 'ml-dsa-65',
    name: 'ML-DSA-65',
    family: 'Module lattice (MLWE)',
    standard: 'NIST FIPS 204',
    level: 3,
    pk: 1952, sk: 4032, sig: 3309,
    upgrade: 'ml-dsa-87',
    note: 'NIST’s final post-quantum signature standard.',
  },
  'ml-dsa-87': {
    id: 'ml-dsa-87',
    name: 'ML-DSA-87',
    family: 'Module lattice (MLWE)',
    standard: 'NIST FIPS 204',
    level: 5,
    pk: 2592, sk: 4896, sig: 4627,
    upgrade: null,
    note: 'Highest NIST security category.',
  },
  'falcon-512': {
    id: 'falcon-512',
    name: 'Falcon-512',
    family: 'NTRU lattice',
    standard: 'Falcon Round 3',
    level: 1,
    pk: 897, sk: 1281, sig: 666,
    upgrade: 'falcon-1024',
    note: 'The scheme Solana’s validator clients prototyped in 2026.',
  },
  'falcon-1024': {
    id: 'falcon-1024',
    name: 'Falcon-1024',
    family: 'NTRU lattice',
    standard: 'Falcon Round 3',
    level: 5,
    pk: 1793, sk: 2305, sig: 1280,
    upgrade: null,
    note: 'Highest NIST security category.',
  },
};

export const ED25519 = { name: 'Ed25519', pk: 32, sk: 32, sig: 64 };
