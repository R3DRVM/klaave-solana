import { connection, PROGRAM_ID } from './config';

async function testConnection() {
  console.log('\n🧪 Testing Klaave Solana Connection...\n');
  
  try {
    // Test RPC connection
    console.log('1️⃣  Checking RPC connection...');
    const version = await connection.getVersion();
    console.log(`   ✅ Connected! Solana version: ${version['solana-core']}`);
    
    // Check program exists
    console.log('\n2️⃣  Verifying program deployment...');
    const programInfo = await connection.getAccountInfo(PROGRAM_ID);
    
    if (!programInfo) {
      console.log('   ❌ Program not found!');
      process.exit(1);
    }
    
    console.log(`   ✅ Program found!`);
    console.log(`   Owner: ${programInfo.owner.toBase58()}`);
    console.log(`   Data size: ${programInfo.data.length} bytes`);
    console.log(`   Executable: ${programInfo.executable}`);
    console.log(`   Rent epoch: ${programInfo.rentEpoch}`);
    
    // Get program balance
    const balance = await connection.getBalance(PROGRAM_ID);
    console.log(`   Balance: ${balance / 1e9} SOL`);
    
    console.log('\n✅ All checks passed! Klaave is deployed and ready.');
    console.log(`\n🔗 Explorer: https://explorer.solana.com/address/${PROGRAM_ID.toBase58()}?cluster=devnet\n`);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

testConnection();
