import { AccountRepository } from '../data/accountRepository';

export interface DailyResetJobResult {
  accountId: string;
  resetDate: string;
  dailyStartEquity?: string;
  alreadyRun?: boolean;
  success: boolean;
}

/**
 * Runs the daily reset job for an account.
 * Idempotent per (account_id, reset_date).
 * Captures dailyStartEquity, clears daily loss usage.
 */
export function runDailyResetJob(accountId: string, now: Date = new Date()): DailyResetJobResult {
  const resetDate = now.toISOString().slice(0, 10);
  const result = AccountRepository.executeDailyReset(accountId, now);

  return {
    accountId,
    resetDate,
    dailyStartEquity: result.dailyStartEquity,
    alreadyRun: result.alreadyRun,
    success: result.success,
  };
}

/**
 * Batch runner for all accounts whose reset time has tripped.
 */
export function runAllScheduledDailyResets(now: Date = new Date()): DailyResetJobResult[] {
  const accounts = AccountRepository.getAllAccounts();
  const results: DailyResetJobResult[] = [];

  for (const account of accounts) {
    const res = runDailyResetJob(account.id, now);
    results.push(res);
  }

  return results;
}
