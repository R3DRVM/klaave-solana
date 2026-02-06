import { PublicKey, Connection, clusterApiUrl } from '@solana/web3.js';

export const PROGRAM_ID = new PublicKey('DNiUvDVUEhZWQNWcidKz86LgmZ3p7DSpR5R7xn2KTxw9');
export const DEVNET_RPC = clusterApiUrl('devnet');
export const connection = new Connection(DEVNET_RPC, 'confirmed');

// USDC Devnet mint
export const USDC_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');

console.log('✅ Klaave CLI Config Loaded');
console.log(`Program ID: ${PROGRAM_ID.toBase58()}`);
console.log(`Network: Devnet`);
console.log(`RPC: ${DEVNET_RPC}`);
