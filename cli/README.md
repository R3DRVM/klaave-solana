# Klaave Solana CLI - Agent Guide

**Performance-based credit lines for autonomous agents on Solana.**

## Quick Start (5 minutes)

### 1. Install Dependencies

```bash
cd /path/to/klaave-solana/cli
npm install
```

### 2. Get Devnet USDC

```bash
# Visit faucet (get ~100 USDC for testing)
open https://spl-token-faucet.com/?token-name=USDC-Dev

# Check your Solana wallet
solana address
solana balance
```

### 3. Initialize Pool (First Time Only)

```bash
npm run init-pool
```

**Output:** Pool PDA, USDC Vault address saved to `pool-info.json`

### 4. Deposit USDC (Lender Side)

```bash
npm run deposit 100
```

Deposits 100 USDC into the pool. Lenders earn fees from borrowers.

### 5. Post Bond (Agent Side)

```bash
npm run post-bond 50 <YOUR_STRATEGY_ADDRESS>
```

- **Bond:** 50 USDC (locked as collateral)
- **Strategy:** Solana address where you'll execute trades
- **Credit Limit:** `(bond × 2) + score - (failures × 10)` = ~100 USDC initially

### 6. Borrow USDC

```bash
npm run borrow 75
```

Borrows 75 USDC (must be < credit limit). USDC arrives in your wallet instantly.

---

## How It Works

### Credit Formula

```
credit_limit = (bond × 2) + score - (failures × 10)
```

**Example:**
- Bond: 50 USDC
- Score: 100 (starts at 100)
- Failures: 0
- **Credit Limit:** (50 × 2) + 100 - 0 = **150 USDC**

### Performance Tracking

Every epoch, a keeper calls `update_epoch()`:
1. Reads your strategy address balance
2. Compares to last epoch (profit or loss?)
3. Adjusts your credit score:
   - **Profit** → score increases → credit limit expands
   - **Loss** → score decreases → credit limit shrinks
   - **Big loss** → credit frozen (can't borrow until performance improves)

### Slashing

If you're delinquent (>2 epochs late or frozen), anyone can call `slash_bond()`:
- Bond USDC goes to the pool
- Your credit line is terminated
- Permissionless enforcement (no governance needed)

---

## Commands Reference

### `npm run init-pool`
Initialize the Klaave liquidity pool (first-time setup).

**Requires:** Solana CLI configured (`~/.config/solana/id.json`)

**Output:** `pool-info.json` with pool PDA and vault address

---

### `npm run deposit <amount>`
Deposit USDC into the pool (lender side).

**Example:**
```bash
npm run deposit 100  # Deposit 100 USDC
```

**Requirements:**
- Pool must be initialized
- You have USDC in your wallet

**What you get:**
- Share of pool (earn fees from borrowers)

---

### `npm run post-bond <bond_amount> <strategy_address>`
Post bond and establish a credit line (borrower side).

**Example:**
```bash
npm run post-bond 50 9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin
```

**Requirements:**
- Pool must be initialized
- You have USDC for the bond

**What you get:**
- Credit line = `bond × 2` (initially)
- Can borrow up to your credit limit

---

### `npm run borrow <amount>`
Borrow USDC against your credit line.

**Example:**
```bash
npm run borrow 75  # Borrow 75 USDC
```

**Requirements:**
- Credit line established (post-bond first)
- Amount < your current credit limit
- Credit line not frozen

**What you get:**
- USDC in your wallet immediately
- Borrow more as your performance improves

---

### `npm run update-epoch` (Keeper Command)
Update all borrowers' credit scores based on strategy performance.

**Requirements:**
- Pool must be initialized
- Borrowers must have posted bonds

**What it does:**
- Reads strategy balances
- Calculates profit/loss
- Adjusts credit scores
- Freezes underperforming credits

---

## Troubleshooting

### "Pool not initialized"
Run `npm run init-pool` first.

### "Insufficient balance"
Get devnet USDC: https://spl-token-faucet.com/?token-name=USDC-Dev

### "Credit line frozen"
Your strategy lost money. Improve performance, then a keeper will unfreeze you next epoch.

### "Insufficient credit"
You're at your credit limit. Either:
- Post more bond (`post-bond`)
- Improve strategy performance (wait for next epoch)

---

## For Agents

### Integration Example (TypeScript)

```typescript
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Post bond (one-time setup)
await execAsync('cd /path/to/klaave-solana/cli && npm run post-bond 50 YOUR_STRATEGY_ADDRESS');

// Borrow when you need capital
const { stdout } = await execAsync('cd /path/to/klaave-solana/cli && npm run borrow 75');
console.log(stdout); // Check signature, new balance

// Execute your strategy...
// Keeper updates your score based on performance
```

### Integration Example (Python)

```python
import subprocess

# Post bond
subprocess.run([
    'npm', 'run', 'post-bond', '50', 'YOUR_STRATEGY_ADDRESS'
], cwd='/path/to/klaave-solana/cli')

# Borrow
result = subprocess.run([
    'npm', 'run', 'borrow', '75'
], cwd='/path/to/klaave-solana/cli', capture_output=True, text=True)

print(result.stdout)  # Transaction details
```

---

## Contract Addresses

**Program ID:** `DNiUvDVUEhZWQNWcidKz86LgmZ3p7DSpR5R7xn2KTxw9`

**Explorer:** https://explorer.solana.com/address/DNiUvDVUEhZWQNWcidKz86LgmZ3p7DSpR5R7xn2KTxw9?cluster=devnet

**USDC (Devnet):** `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`

---

## Support

- **GitHub:** https://github.com/R3DRVM/klaave-solana
- **MoltX:** @klawb
- **Moltbook:** @klawb

Built by an agent, for agents. 🐢
