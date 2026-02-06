#!/usr/bin/env ts-node
import { Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getOrCreateAssociatedTokenAccount } from '@solana/spl-token';
import { PROGRAM_ID, USDC_MINT, connection } from '../config';
import * as fs from 'fs';
import * as path from 'path';

async function deposit() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('Usage: npm run deposit <amount_in_usdc>');
    console.error('Example: npm run deposit 100');
    process.exit(1);
  }

  const amount = parseFloat(args[0]);
  if (isNaN(amount) || amount <= 0) {
    console.error('❌ Invalid amount');
    process.exit(1);
  }

  const amountLamports = BigInt(Math.floor(amount * 1_000_000)); // USDC has 6 decimals

  console.log(`💵 Depositing ${amount} USDC to Klaave Pool...\n`);

  // Load depositor keypair
  const walletPath = path.join(process.env.HOME!, '.config', 'solana', 'id.json');
  const depositorKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(walletPath, 'utf-8')))
  );

  console.log(`Depositor: ${depositorKeypair.publicKey.toBase58()}`);

  // Load pool info
  const poolInfoPath = path.join(__dirname, '../../pool-info.json');
  if (!fs.existsSync(poolInfoPath)) {
    console.error('❌ Pool not initialized. Run: npm run init-pool');
    process.exit(1);
  }

  const poolInfo = JSON.parse(fs.readFileSync(poolInfoPath, 'utf-8'));
  const poolPda = new PublicKey(poolInfo.poolPda);
  const vaultAddress = new PublicKey(poolInfo.vaultAddress);

  console.log(`Pool: ${poolPda.toBase58()}`);
  console.log(`Vault: ${vaultAddress.toBase58()}`);

  // Get or create depositor's USDC account
  console.log('\n🔍 Checking USDC balance...');
  const depositorUsdc = await getOrCreateAssociatedTokenAccount(
    connection,
    depositorKeypair,
    USDC_MINT,
    depositorKeypair.publicKey
  );

  const balance = await connection.getTokenAccountBalance(depositorUsdc.address);
  const balanceUsdc = parseFloat(balance.value.amount) / 1_000_000;
  console.log(`Balance: ${balanceUsdc} USDC`);

  if (balanceUsdc < amount) {
    console.error(`❌ Insufficient balance. You have ${balanceUsdc} USDC, trying to deposit ${amount}`);
    console.log('\n💡 Get devnet USDC: https://spl-token-faucet.com/?token-name=USDC-Dev');
    process.exit(1);
  }

  // Build deposit instruction
  const depositData = Buffer.alloc(9);
  depositData.writeUInt8(1, 0); // Discriminator for deposit
  depositData.writeBigUInt64LE(amountLamports, 1);

  const depositIx = {
    programId: PROGRAM_ID,
    keys: [
      { pubkey: poolPda, isSigner: false, isWritable: true },
      { pubkey: depositorKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: depositorUsdc.address, isSigner: false, isWritable: true },
      { pubkey: vaultAddress, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: depositData,
  };

  console.log('\n🚀 Sending transaction...');
  const tx = new Transaction().add(depositIx);
  
  try {
    const signature = await sendAndConfirmTransaction(
      connection,
      tx,
      [depositorKeypair],
      { commitment: 'confirmed' }
    );

    console.log('\n✅ Deposit successful!');
    console.log(`Amount: ${amount} USDC`);
    console.log(`Signature: ${signature}`);
    console.log(`Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`);

  } catch (error) {
    console.error('\n❌ Transaction failed:', error);
    process.exit(1);
  }
}

deposit().then(() => process.exit(0)).catch(console.error);
