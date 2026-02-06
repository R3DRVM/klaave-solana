#!/usr/bin/env ts-node
import { Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getOrCreateAssociatedTokenAccount, createAccount } from '@solana/spl-token';
import { PROGRAM_ID, USDC_MINT, connection } from '../config';
import * as fs from 'fs';
import * as path from 'path';

async function postBond() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: npm run post-bond <bond_amount_usdc> <strategy_address>');
    console.error('Example: npm run post-bond 50 9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin');
    process.exit(1);
  }

  const bondAmount = parseFloat(args[0]);
  const strategyAddress = new PublicKey(args[1]);

  if (isNaN(bondAmount) || bondAmount <= 0) {
    console.error('❌ Invalid bond amount');
    process.exit(1);
  }

  const bondLamports = BigInt(Math.floor(bondAmount * 1_000_000));

  console.log(`🔒 Posting Bond to Klaave...\n`);
  console.log(`Bond Amount: ${bondAmount} USDC`);
  console.log(`Strategy Address: ${strategyAddress.toBase58()}\n`);

  // Load borrower keypair
  const walletPath = path.join(process.env.HOME!, '.config', 'solana', 'id.json');
  const borrowerKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(walletPath, 'utf-8')))
  );

  console.log(`Borrower: ${borrowerKeypair.publicKey.toBase58()}`);

  // Load pool info
  const poolInfoPath = path.join(__dirname, '../../pool-info.json');
  if (!fs.existsSync(poolInfoPath)) {
    console.error('❌ Pool not initialized. Run: npm run init-pool');
    process.exit(1);
  }

  const poolInfo = JSON.parse(fs.readFileSync(poolInfoPath, 'utf-8'));

  // Derive credit score PDA
  const [creditScorePda] = PublicKey.findProgramAddressSync(
    [Buffer.from('credit'), borrowerKeypair.publicKey.toBuffer()],
    PROGRAM_ID
  );

  console.log(`Credit Score PDA: ${creditScorePda.toBase58()}`);

  // Create bond vault
  const bondVault = Keypair.generate();
  console.log(`Bond Vault: ${bondVault.publicKey.toBase58()}`);

  // Get borrower's USDC account
  const borrowerUsdc = await getOrCreateAssociatedTokenAccount(
    connection,
    borrowerKeypair,
    USDC_MINT,
    borrowerKeypair.publicKey
  );

  // Check balance
  const balance = await connection.getTokenAccountBalance(borrowerUsdc.address);
  const balanceUsdc = parseFloat(balance.value.amount) / 1_000_000;
  console.log(`\nUSDC Balance: ${balanceUsdc}`);

  if (balanceUsdc < bondAmount) {
    console.error(`❌ Insufficient balance. Need ${bondAmount} USDC, have ${balanceUsdc}`);
    process.exit(1);
  }

  // Build post_bond instruction
  const postBondData = Buffer.alloc(49);
  postBondData.writeUInt8(2, 0); // Discriminator for post_bond
  postBondData.writeBigUInt64LE(bondLamports, 1);
  strategyAddress.toBuffer().copy(postBondData, 9);

  const postBondIx = {
    programId: PROGRAM_ID,
    keys: [
      { pubkey: creditScorePda, isSigner: false, isWritable: true },
      { pubkey: borrowerKeypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: borrowerUsdc.address, isSigner: false, isWritable: true },
      { pubkey: bondVault.publicKey, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: postBondData,
  };

  console.log('\n🚀 Sending transaction...');
  const tx = new Transaction().add(postBondIx);
  
  try {
    const signature = await sendAndConfirmTransaction(
      connection,
      tx,
      [borrowerKeypair, bondVault],
      { commitment: 'confirmed' }
    );

    console.log('\n✅ Bond posted successfully!');
    console.log(`Signature: ${signature}`);
    console.log(`Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
    console.log(`\n📋 Credit Line Details:`);
    console.log(`  Borrower: ${borrowerKeypair.publicKey.toBase58()}`);
    console.log(`  Bond: ${bondAmount} USDC`);
    console.log(`  Strategy: ${strategyAddress.toBase58()}`);
    console.log(`  Credit Score PDA: ${creditScorePda.toBase58()}`);
    console.log(`  Initial Credit Limit: ${bondAmount * 2} USDC (bond × 2)`);

  } catch (error) {
    console.error('\n❌ Transaction failed:', error);
    process.exit(1);
  }
}

postBond().then(() => process.exit(0)).catch(console.error);
