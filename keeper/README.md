# Klaave Keeper Bot

Automated epoch updates for Klaave credit lines. Monitors all borrowers and updates their credit scores based on strategy performance.

## What It Does

Every epoch (default: 1 hour), the keeper:
1. Scans all active credit lines
2. Reads each borrower's strategy address balance
3. Calculates profit/loss since last epoch
4. Updates credit scores:
   - **Profit** → score increases → credit limit expands
   - **Loss** → score decreases → credit limit shrinks
   - **Big loss** → credit frozen (borrowing disabled)
5. Increments failure counter if borrower is delinquent

## Running the Keeper

### Install Dependencies

```bash
cd /path/to/klaave-solana/keeper
npm install
```

### Start Keeper

```bash
npm start
```

The keeper runs continuously. Press Ctrl+C to stop.

## Configuration

Edit `index.ts` to adjust:

```typescript
const EPOCH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const CHECK_INTERVAL_MS = 5 * 60 * 1000;  // Check every 5 minutes
```

## Output

```
🤖 Keeper Bot Started
Keeper Address: 36AdYz4f6iWfokJv5Hy9KWkaAME7e18QZNWZt4YHJGTZ
Network: Devnet
Epoch Interval: 60 minutes

🔍 Checking for credit lines that need epoch updates...
Found 3 active credit line(s)

⏰ Updating epoch for 9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin
  Strategy: AaBC...
  Bond: 50 USDC
  Borrowed: 75 USDC
  Score: 105
  Last Update: 2/5/2026, 6:00:00 PM
  ✅ Epoch updated
  Signature: 3kZx...

📊 Stats:
  Total Credit Lines: 3
  Total Epoch Updates: 15

💤 Sleeping 5 minutes until next check...
```

## How Credit Scoring Works

### Formula
```
credit_limit = (bond × 2) + score - (failures × 10)
```

### Score Adjustments
- **Profit:** `new_score = old_score + (profit_percent × 10)`
- **Loss:** `new_score = old_score - (loss_percent × 10)`
- **Frozen:** If `score < freeze_threshold` (default: 50), borrowing is disabled
- **Failures:** If >2 epochs late, failure counter increments (penalty: -10 USDC per failure)

### Example

**Epoch 1:**
- Bond: 50 USDC
- Borrowed: 75 USDC
- Strategy equity: 100 USDC (initial)
- Score: 100
- Credit limit: (50 × 2) + 100 = 200 USDC

**Epoch 2 (10% profit):**
- Strategy equity: 110 USDC (+10%)
- Score: 100 + (10 × 1) = 110
- Credit limit: (50 × 2) + 110 = 210 USDC ✅ Expanded

**Epoch 3 (15% loss):**
- Strategy equity: 93.5 USDC (-15%)
- Score: 110 - (15 × 1) = 95
- Credit limit: (50 × 2) + 95 = 195 USDC ⚠️ Contracted

**Epoch 4 (50% loss):**
- Strategy equity: 46.75 USDC (-50%)
- Score: 95 - (50 × 1) = 45
- Credit limit: FROZEN ❄️ (score < 50)

## Keeper Rewards

Keepers earn a fee for each epoch update (configurable in smart contract). This incentivizes third parties to run keepers and keep the system healthy.

## Production Deployment

For mainnet:
1. Update `PROGRAM_ID` and `DEVNET_RPC` to mainnet values
2. Run as a systemd service or Docker container
3. Monitor logs and set up alerts for failures
4. Use a dedicated keeper wallet (separate from deployer)

### Example systemd Service

```ini
[Unit]
Description=Klaave Keeper Bot
After=network.target

[Service]
Type=simple
User=keeper
WorkingDirectory=/opt/klaave-keeper
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

## Monitoring

Track keeper performance:
- Total credit lines monitored
- Epoch updates per hour
- Failed updates (investigate cause)
- Keeper wallet balance (needs SOL for transaction fees)

---

Built for 24/7 autonomous operation. Set it and forget it. 🤖
