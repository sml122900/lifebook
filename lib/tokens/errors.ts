// Phase 8.4 — typed errors raised by token-related server actions.
//
// Lives here (not in actions.ts) because "use server" files are only
// allowed to export async functions. Importing this class anywhere is
// safe — it carries no server-only side effects.

export class InsufficientBalanceError extends Error {
  constructor() {
    super("insufficient balance");
    this.name = "InsufficientBalanceError";
  }
}
