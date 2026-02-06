#!/usr/bin/env ts-node
import { Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } from '@solana/spl-token';
import { PROGRAM_ID, USDC_MINT, connection } from '../config';
import * as fs from 'fs';
import * as path from 'path';

async function initPool() {
  console.log('🔧 Initializing Klaave Pool on Devnet...\n');

  // Load authority keypair (deployer wallet)
  const walletPath = path.join(process.env.HOME!, '.config', 'solana', 'id.json');
  if (!fs.existsSync(walletPath)) {
    console.error('❌ Wallet not found at', walletPath);
    console.log('Run: solana-keygen new');
    process.exit(1);
  }

  const authorityKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(walletPath, 'utf-8')))
  );

  console.log(`Authority: ${authorityKeypair.publicKey.toBase58()}`);

  // Derive pool PDA
  const [poolPda, poolBump] = PublicKey.findProgramAddressSync(
    [Buffer.from('pool')],
    PROGRAM_ID
  );

  console.log(`Pool PDA: ${poolPda.toBase58()} (bump: ${poolBump})`);

  // Check if pool already exists
  const poolInfoPath = path.join(__dirname, '../../pool-info.json');
  if (fs.existsSync(poolInfoPath)) {
    const existing = JSON.parse(fs.readFileSync(poolInfoPath, 'utf-8'));
    console.log('\n⚠️  Pool already initialized!');
    console.log(`Pool PDA: ${existing.poolPda}`);
    console.log(`Vault: ${existing.vaultAddress}`);
    console.log('\nSkipping initialization. Delete pool-info.json to re-initialize.');
    process.exit(0);
  }

  // Get Associated Token Address for pool PDA (this is deterministic)
  console.log('\n📦 Creating USDC vault (ATA)...');
  const vaultAddress = await getAssociatedTokenAddress(
    USDC_MINT,
    poolPda,
    true // allowOwnerOffCurve = true (PDA can own ATA)
  );

  console.log(`Vault address: ${vaultAddress.toBase58()}`);

  // Create the ATA if it doesn't exist
  const createAtaIx = createAssociatedTokenAccountInstruction(
    authorityKeypair.publicKey, // payer
    vaultAddress,
    poolPda, // owner
    USDC_MINT
  );

  // Build initialize_pool instruction
  const initPoolData = Buffer.alloc(9);
  initPoolData.writeUInt8(0, 0); // Discriminator for initialize_pool
  initPoolData.writeUInt8(poolBump, 1);

  const initPoolIx = {
    programId: PROGRAM_ID,
    keys: [
      { pubkey: poolPda, isSigner: false, isWritable: true },
      { pubkey: authorityKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: vaultAddress, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: initPoolData,
  };

  console.log('\n🚀 Sending transaction...');
  const tx = new Transaction().add(createAtaIx, initPoolIx);
  
  try {
    const signature = await sendAndConfirmTransaction(
      connection,
      tx,
      [authorityKeypair],
      { commitment: 'confirmed' }
    );

    console.log('\n✅ Pool initialized!');
    console.log(`Signature: ${signature}`);
    console.log(`Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
    console.log(`\n📋 Pool Details:`);
    console.log(`  Pool PDA: ${poolPda.toBase58()}`);
    console.log(`  USDC Vault: ${vaultAddress.toBase58()}`);
    console.log(`  Authority: ${authorityKeypair.publicKey.toBase58()}`);
    
    // Save pool info for other commands
    const poolInfo = {
      poolPda: poolPda.toBase58(),
      vaultAddress: vaultAddress.toBase58(),
      authority: authorityKeypair.publicKey.toBase58(),
      bump: poolBump,
    };
    
    const poolInfoPath = path.join(__dirname, '../../pool-info.json');
    fs.writeFileSync(poolInfoPath, JSON.stringify(poolInfo, null, 2));
    console.log(`\n💾 Pool info saved to ${poolInfoPath}`);

  } catch (error) {
    console.error('\n❌ Transaction failed:', error);
    process.exit(1);
  }
}

initPool().then(() => process.exit(0)).catch(console.error);
