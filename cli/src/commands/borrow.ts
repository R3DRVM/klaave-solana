#!/usr/bin/env ts-node
import { Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getOrCreateAssociatedTokenAccount } from '@solana/spl-token';
import { PROGRAM_ID, USDC_MINT, connection } from '../config';
import * as fs from 'fs';
import * as path from 'path';

async function borrow() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('Usage: npm run borrow <amount_in_usdc>');
    console.error('Example: npm run borrow 75');
    process.exit(1);
  }

  const amount = parseFloat(args[0]);
  if (isNaN(amount) || amount <= 0) {
    console.error('❌ Invalid amount');
    process.exit(1);
  }

  const amountLamports = BigInt(Math.floor(amount * 1_000_000));

  console.log(`💰 Borrowing ${amount} USDC from Klaave...\n`);

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
  const poolPda = new PublicKey(poolInfo.poolPda);
  const vaultAddress = new PublicKey(poolInfo.vaultAddress);

  // Derive credit score PDA
  const [creditScorePda] = PublicKey.findProgramAddressSync(
    [Buffer.from('credit'), borrowerKeypair.publicKey.toBuffer()],
    PROGRAM_ID
  );

  console.log(`Credit Score PDA: ${creditScorePda.toBase58()}`);

  // Get borrower's USDC account (where funds will be sent)
  const borrowerUsdc = await getOrCreateAssociatedTokenAccount(
    connection,
    borrowerKeypair,
    USDC_MINT,
    borrowerKeypair.publicKey
  );

  console.log(`Recipient USDC account: ${borrowerUsdc.address.toBase58()}`);

  // Check credit score account
  try {
    const creditAccount = await connection.getAccountInfo(creditScorePda);
    if (!creditAccount) {
      console.error('❌ Credit line not found. Run: npm run post-bond <amount> <strategy>');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error checking credit line:', error);
    process.exit(1);
  }

  // Build borrow instruction
  const borrowData = Buffer.alloc(9);
  borrowData.writeUInt8(3, 0); // Discriminator for borrow
  borrowData.writeBigUInt64LE(amountLamports, 1);

  const borrowIx = {
    programId: PROGRAM_ID,
    keys: [
      { pubkey: poolPda, isSigner: false, isWritable: true },
      { pubkey: creditScorePda, isSigner: false, isWritable: true },
      { pubkey: borrowerKeypair.publicKey, isSigner: true, isWritable: false },
      { pubkey: borrowerUsdc.address, isSigner: false, isWritable: true },
      { pubkey: vaultAddress, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: borrowData,
  };

  console.log('\n🚀 Sending transaction...');
  const tx = new Transaction().add(borrowIx);
  
  try {
    const signature = await sendAndConfirmTransaction(
      connection,
      tx,
      [borrowerKeypair],
      { commitment: 'confirmed' }
    );

    console.log('\n✅ Borrow successful!');
    console.log(`Amount: ${amount} USDC`);
    console.log(`Signature: ${signature}`);
    console.log(`Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`);
    
    // Check new balance
    const newBalance = await connection.getTokenAccountBalance(borrowerUsdc.address);
    const newBalanceUsdc = parseFloat(newBalance.value.amount) / 1_000_000;
    console.log(`\n💵 New USDC Balance: ${newBalanceUsdc} USDC`);

  } catch (error) {
    console.error('\n❌ Transaction failed:', error);
    if (error.toString().includes('CreditLineFrozen')) {
      console.error('\n💡 Your credit line is frozen due to low performance. Improve your strategy equity!');
    } else if (error.toString().includes('InsufficientCredit')) {
      console.error('\n💡 Insufficient credit limit. Post more bond or improve your credit score!');
    }
    process.exit(1);
  }
}

borrow().then(() => process.exit(0)).catch(console.error);
