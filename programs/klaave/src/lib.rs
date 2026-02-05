use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("DTUuKBLR2jpCZmPJXFE2i42XhPL3MkCXqoFK7qxfXc9E");

#[program]
pub mod klaave {
    use super::*;

    /// Initialize the liquidity pool
    pub fn initialize_pool(
        ctx: Context<InitializePool>,
        pool_bump: u8,
    ) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.authority = ctx.accounts.authority.key();
        pool.usdc_vault = ctx.accounts.usdc_vault.key();
        pool.total_deposits = 0;
        pool.total_borrowed = 0;
        pool.bump = pool_bump;
        
        msg!("Pool initialized. Vault: {}", pool.usdc_vault);
        Ok(())
    }

    /// Lender deposits USDC into pool
    pub fn deposit(
        ctx: Context<Deposit>,
        amount: u64,
    ) -> Result<()> {
        require!(amount > 0, ErrorCode::InvalidAmount);
        
        // Transfer USDC from depositor to vault
        let cpi_accounts = Transfer {
            from: ctx.accounts.depositor_usdc.to_account_info(),
            to: ctx.accounts.usdc_vault.to_account_info(),
            authority: ctx.accounts.depositor.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, amount)?;

        let pool = &mut ctx.accounts.pool;
        pool.total_deposits = pool.total_deposits.checked_add(amount)
            .ok_or(ErrorCode::Overflow)?;

        msg!("Deposited {} USDC to pool", amount);
        Ok(())
    }

    /// Agent posts bond to establish credit line
    pub fn post_bond(
        ctx: Context<PostBond>,
        bond_amount: u64,
        strategy_address: Pubkey,
    ) -> Result<()> {
        require!(bond_amount > 0, ErrorCode::InvalidAmount);
        
        // Transfer USDC bond from borrower to vault
        let cpi_accounts = Transfer {
            from: ctx.accounts.borrower_usdc.to_account_info(),
            to: ctx.accounts.bond_vault.to_account_info(),
            authority: ctx.accounts.borrower.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, bond_amount)?;

        let credit_score = &mut ctx.accounts.credit_score;
        credit_score.borrower = ctx.accounts.borrower.key();
        credit_score.bond_amount = bond_amount;
        credit_score.strategy_address = strategy_address;
        credit_score.borrowed_amount = 0;
        credit_score.score = 100; // Initial score
        credit_score.last_equity = 0;
        credit_score.last_epoch_update = Clock::get()?.unix_timestamp;
        credit_score.failures = 0;
        credit_score.frozen = false;

        msg!("Bond posted: {} USDC, Strategy: {}", bond_amount, strategy_address);
        Ok(())
    }

    /// Agent borrows USDC against credit line
    pub fn borrow(
        ctx: Context<Borrow>,
        amount: u64,
    ) -> Result<()> {
        let credit_score = &mut ctx.accounts.credit_score;
        require!(!credit_score.frozen, ErrorCode::CreditLineFrozen);
        require!(amount > 0, ErrorCode::InvalidAmount);

        // Calculate credit limit: (bond * 2) + score - (failures * 10)
        let bond_factor = credit_score.bond_amount.checked_mul(2)
            .ok_or(ErrorCode::Overflow)?;
        let failure_penalty = (credit_score.failures as u64).checked_mul(10_000_000) // 10 USDC per failure
            .ok_or(ErrorCode::Overflow)?;
        
        let credit_limit = bond_factor
            .checked_add(credit_score.score as u64)
            .ok_or(ErrorCode::Overflow)?
            .checked_sub(failure_penalty)
            .ok_or(ErrorCode::Underflow)?;

        let new_borrowed = credit_score.borrowed_amount.checked_add(amount)
            .ok_or(ErrorCode::Overflow)?;
        
        require!(new_borrowed <= credit_limit, ErrorCode::CreditLimitExceeded);

        // Transfer USDC from pool vault to borrower
        let pool = &ctx.accounts.pool;
        let seeds = &[
            b"pool".as_ref(),
            &[pool.bump],
        ];
        let signer = &[&seeds[..]];
        
        let cpi_accounts = Transfer {
            from: ctx.accounts.usdc_vault.to_account_info(),
            to: ctx.accounts.borrower_usdc.to_account_info(),
            authority: ctx.accounts.pool.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::transfer(cpi_ctx, amount)?;

        credit_score.borrowed_amount = new_borrowed;
        let pool_mut = &mut ctx.accounts.pool;
        pool_mut.total_borrowed = pool_mut.total_borrowed.checked_add(amount)
            .ok_or(ErrorCode::Overflow)?;

        msg!("Borrowed {} USDC. New balance: {}", amount, new_borrowed);
        Ok(())
    }

    /// Update credit score based on strategy performance
    pub fn update_epoch(
        ctx: Context<UpdateEpoch>,
        current_equity: u64,
    ) -> Result<()> {
        let credit_score = &mut ctx.accounts.credit_score;
        let clock = Clock::get()?;
        
        // Calculate performance delta
        if credit_score.last_equity > 0 {
            if current_equity > credit_score.last_equity {
                // Profit: increase score
                let delta = current_equity - credit_score.last_equity;
                let score_increase = (delta / 1_000_000).min(50); // Max +50 per epoch
                credit_score.score = credit_score.score.saturating_add(score_increase as u16);
            } else if current_equity < credit_score.last_equity {
                // Loss: decrease score
                let delta = credit_score.last_equity - current_equity;
                let score_decrease = (delta / 1_000_000).min(50); // Max -50 per epoch
                credit_score.score = credit_score.score.saturating_sub(score_decrease as u16);
                
                // Freeze if score drops too low
                if credit_score.score < 50 {
                    credit_score.frozen = true;
                }
            }
        }

        credit_score.last_equity = current_equity;
        credit_score.last_epoch_update = clock.unix_timestamp;

        msg!("Epoch updated. New score: {}, Equity: {}", credit_score.score, current_equity);
        Ok(())
    }
}

// Account structures

#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Pool::LEN,
        seeds = [b"pool"],
        bump
    )]
    pub pool: Account<'info, Pool>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub usdc_vault: Account<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    
    #[account(mut)]
    pub usdc_vault: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub depositor_usdc: Account<'info, TokenAccount>,
    
    pub depositor: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct PostBond<'info> {
    #[account(
        init,
        payer = borrower,
        space = 8 + CreditScore::LEN,
        seeds = [b"credit_score", borrower.key().as_ref()],
        bump
    )]
    pub credit_score: Account<'info, CreditScore>,
    
    #[account(mut)]
    pub bond_vault: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub borrower_usdc: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub borrower: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Borrow<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    
    #[account(mut)]
    pub credit_score: Account<'info, CreditScore>,
    
    #[account(mut)]
    pub usdc_vault: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub borrower_usdc: Account<'info, TokenAccount>,
    
    pub borrower: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct UpdateEpoch<'info> {
    #[account(mut)]
    pub credit_score: Account<'info, CreditScore>,
    
    pub keeper: Signer<'info>,
}

// State structures

#[account]
pub struct Pool {
    pub authority: Pubkey,
    pub usdc_vault: Pubkey,
    pub total_deposits: u64,
    pub total_borrowed: u64,
    pub bump: u8,
}

impl Pool {
    pub const LEN: usize = 32 + 32 + 8 + 8 + 1;
}

#[account]
pub struct CreditScore {
    pub borrower: Pubkey,
    pub bond_amount: u64,
    pub strategy_address: Pubkey,
    pub borrowed_amount: u64,
    pub score: u16,
    pub last_equity: u64,
    pub last_epoch_update: i64,
    pub failures: u16,
    pub frozen: bool,
}

impl CreditScore {
    pub const LEN: usize = 32 + 8 + 32 + 8 + 2 + 8 + 8 + 2 + 1;
}

// Errors

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Credit limit exceeded")]
    CreditLimitExceeded,
    #[msg("Credit line is frozen")]
    CreditLineFrozen,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Arithmetic underflow")]
    Underflow,
}
