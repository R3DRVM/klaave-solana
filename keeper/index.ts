#!/usr/bin/env ts-node
/**
 * Klaave Keeper Bot - Automated Epoch Updates
 * 
 * Monitors all credit lines and updates scores based on strategy performance.
 * Runs continuously, checking every epoch interval (default: 1 hour).
 */

import { Connection, PublicKey, Keypair, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';

const PROGRAM_ID = new PublicKey('DNiUvDVUEhZWQNWcidKz86LgmZ3p7DSpR5R7xn2KTxw9');
const DEVNET_RPC = 'https://api.devnet.solana.com';
const connection = new Connection(DEVNET_RPC, 'confirmed');

const EPOCH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes

interface CreditLine {
  borrower: PublicKey;
  creditScorePda: PublicKey;
  strategyAddress: PublicKey;
  bondAmount: number;
  borrowedAmount: number;
  score: number;
  lastEpochUpdate: number;
}

// Load keeper keypair
const KEEPER_KEYPAIR_PATH = path.join(process.env.HOME!, '.config', 'solana', 'id.json');
let keeperKeypair: Keypair;

try {
  keeperKeypair = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(KEEPER_KEYPAIR_PATH, 'utf-8')))
  );
  console.log(`🤖 Keeper Bot Started`);
  console.log(`Keeper Address: ${keeperKeypair.publicKey.toBase58()}`);
  console.log(`Network: Devnet`);
  console.log(`Epoch Interval: ${EPOCH_INTERVAL_MS / 1000 / 60} minutes\n`);
} catch (error) {
  console.error('❌ Failed to load keeper keypair:', error);
  process.exit(1);
}

/**
 * Fetch all credit lines from the program
 */
async function fetchAllCreditLines(): Promise<CreditLine[]> {
  try {
    const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
      filters: [
        {
          dataSize: 200, // CreditScore account size (approximate)
        },
      ],
    });

    const creditLines: CreditLine[] = [];

    for (const account of accounts) {
      try {
        const data = account.account.data;
        
        // Parse CreditScore struct (Anchor discriminator + fields)
        const borrower = new PublicKey(data.slice(8, 40));
        const bondAmount = data.readBigUInt64LE(40);
        const strategyAddress = new PublicKey(data.slice(48, 80));
        const borrowedAmount = data.readBigUInt64LE(80);
        const score = data.readUInt32LE(88);
        const lastEpochUpdate = data.readBigInt64LE(96);

        creditLines.push({
          borrower,
          creditScorePda: account.pubkey,
          strategyAddress,
          bondAmount: Number(bondAmount) / 1_000_000, // Convert to USDC
          borrowedAmount: Number(borrowedAmount) / 1_000_000,
          score,
          lastEpochUpdate: Number(lastEpochUpdate),
        });
      } catch (parseError) {
        // Skip accounts that don't match expected format
        continue;
      }
    }

    return creditLines;
  } catch (error) {
    console.error('Error fetching credit lines:', error);
    return [];
  }
}

/**
 * Update epoch for a single credit line
 */
async function updateCreditLineEpoch(creditLine: CreditLine): Promise<boolean> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const timeSinceLastUpdate = now - creditLine.lastEpochUpdate;
    
    // Skip if not enough time has passed
    if (timeSinceLastUpdate < EPOCH_INTERVAL_MS / 1000) {
      return false;
    }

    console.log(`\n⏰ Updating epoch for ${creditLine.borrower.toBase58()}`);
    console.log(`  Strategy: ${creditLine.strategyAddress.toBase58()}`);
    console.log(`  Bond: ${creditLine.bondAmount} USDC`);
    console.log(`  Borrowed: ${creditLine.borrowedAmount} USDC`);
    console.log(`  Score: ${creditLine.score}`);
    console.log(`  Last Update: ${new Date(creditLine.lastEpochUpdate * 1000).toLocaleString()}`);

    // Build update_epoch instruction
    const updateEpochData = Buffer.alloc(1);
    updateEpochData.writeUInt8(4, 0); // Discriminator for update_epoch

    const updateEpochIx = {
      programId: PROGRAM_ID,
      keys: [
        { pubkey: creditLine.creditScorePda, isSigner: false, isWritable: true },
        { pubkey: keeperKeypair.publicKey, isSigner: true, isWritable: false },
        { pubkey: creditLine.strategyAddress, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: updateEpochData,
    };

    const tx = new Transaction().add(updateEpochIx);
    
    const signature = await sendAndConfirmTransaction(
      connection,
      tx,
      [keeperKeypair],
      { commitment: 'confirmed' }
    );

    console.log(`  ✅ Epoch updated`);
    console.log(`  Signature: ${signature}`);
    return true;

  } catch (error) {
    console.error(`  ❌ Failed to update epoch:`, error);
    return false;
  }
}

/**
 * Main keeper loop
 */
async function runKeeperLoop() {
  let totalUpdates = 0;

  while (true) {
    try {
      console.log(`\n🔍 Checking for credit lines that need epoch updates...`);
      const creditLines = await fetchAllCreditLines();
      
      if (creditLines.length === 0) {
        console.log(`No active credit lines found.`);
      } else {
        console.log(`Found ${creditLines.length} active credit line(s)`);
        
        for (const creditLine of creditLines) {
          const updated = await updateCreditLineEpoch(creditLine);
          if (updated) {
            totalUpdates++;
          }
        }
      }

      console.log(`\n📊 Stats:`);
      console.log(`  Total Credit Lines: ${creditLines.length}`);
      console.log(`  Total Epoch Updates: ${totalUpdates}`);
      console.log(`\n💤 Sleeping ${CHECK_INTERVAL_MS / 1000 / 60} minutes until next check...`);
      
      await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL_MS));

    } catch (error) {
      console.error('\n❌ Error in keeper loop:', error);
      console.log('Retrying in 1 minute...');
      await new Promise(resolve => setTimeout(resolve, 60_000));
    }
  }
}

// Start the keeper
runKeeperLoop().catch(console.error);
