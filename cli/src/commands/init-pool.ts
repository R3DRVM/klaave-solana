#!/usr/bin/env ts-node
import { Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, createAccount } from '@solana/spl-token';
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

  // Create USDC vault token account (owned by pool PDA)
  console.log('\n📦 Creating USDC vault...');
  const vaultAccount = Keypair.generate();
  
  const createVaultIx = SystemProgram.createAccount({
    fromPubkey: authorityKeypair.publicKey,
    newAccountPubkey: vaultAccount.publicKey,
    lamports: await connection.getMinimumBalanceForRentExemption(165), // Token account size
    space: 165,
    programId: TOKEN_PROGRAM_ID,
  });

  // Initialize vault as USDC token account
  const initVaultIx = await createAccount(
    connection,
    authorityKeypair,
    USDC_MINT,
    poolPda, // Owner = pool PDA
    vaultAccount
  );

  console.log(`Vault address: ${vaultAccount.publicKey.toBase58()}`);

  // Build initialize_pool instruction
  const initPoolData = Buffer.alloc(9);
  initPoolData.writeUInt8(0, 0); // Discriminator for initialize_pool
  initPoolData.writeUInt8(poolBump, 1);

  const initPoolIx = {
    programId: PROGRAM_ID,
    keys: [
      { pubkey: poolPda, isSigner: false, isWritable: true },
      { pubkey: authorityKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: vaultAccount.publicKey, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: initPoolData,
  };

  console.log('\n🚀 Sending transaction...');
  const tx = new Transaction().add(createVaultIx, initPoolIx);
  
  try {
    const signature = await sendAndConfirmTransaction(
      connection,
      tx,
      [authorityKeypair, vaultAccount],
      { commitment: 'confirmed' }
    );

    console.log('\n✅ Pool initialized!');
    console.log(`Signature: ${signature}`);
    console.log(`Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
    console.log(`\n📋 Pool Details:`);
    console.log(`  Pool PDA: ${poolPda.toBase58()}`);
    console.log(`  USDC Vault: ${vaultAccount.publicKey.toBase58()}`);
    console.log(`  Authority: ${authorityKeypair.publicKey.toBase58()}`);
    
    // Save pool info for other commands
    const poolInfo = {
      poolPda: poolPda.toBase58(),
      vaultAddress: vaultAccount.publicKey.toBase58(),
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
