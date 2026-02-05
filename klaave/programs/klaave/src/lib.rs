use anchor_lang::prelude::*;

declare_id!("B43jA3oCj6ZwrgNs4GyPxJu7MRgWfVSPEusnjfZSgS2W");

#[program]
pub mod klaave {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
