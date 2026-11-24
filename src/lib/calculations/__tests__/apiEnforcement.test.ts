import { describe, it, expect, beforeEach } from 'vitest';
import { AccountRepository } from '../../data/accountRepository';
import { runDailyResetJob } from '../../jobs/dailyResetJob';

describe('Account Repository & Server Gate Enforcement', () => {
  const testAccId = 'acc-integration-test';

  beforeEach(() => {
    // Provision fresh test account
    AccountRepository.createAccountWithRuleSet(
      {
        userId: 'user-unit-test',
        label: 'Apex Test Enforce #1',
        brokerOrFirmId: 'apex',
        accountType: 'funded',
        baseCurrency: 'USD',
        startingBalance: '100000.00',
        phase: 1,
        phaseStatus: 'active',
      },
      {
        createdBy: 'trader',
        dailyLossMode: 'pct_day_start',
        dailyLossValue: '5.0', // $5,000 daily limit
        dailyResetLocalTime: '00:00',
        dailyResetTimezone: 'UTC',
        totalLossMode: 'trailing_peak',
        totalLossValue: '5.0', // $5,000 trailing limit
        warnThresholdPct: 80,
        enforcement: 'enforce',
        profitTargetValue: '6.0',
        minTradingDays: 7,
        maxRiskPerTradePct: '2.0',
      },
      'idemp-key-initial'
    );
  });

  // Test 1: Idempotency-Key caching
  it('returns cached response when identical Idempotency-Key is provided', () => {
    const res1 = AccountRepository.createAccountWithRuleSet(
      {
        userId: 'user-unit-test',
        label: 'Duplicate Key Test',
        brokerOrFirmId: 'ftmo',
        accountType: 'evaluation',
        baseCurrency: 'USD',
        startingBalance: '100000.00',
        phase: 1,
        phaseStatus: 'active',
      },
      {
        createdBy: 'trader',
        dailyLossMode: 'pct_day_start',
        dailyLossValue: '5.0',
        dailyResetLocalTime: '00:00',
        dailyResetTimezone: 'UTC',
        totalLossMode: 'static_start',
        totalLossValue: '10.0',
        warnThresholdPct: 80,
        enforcement: 'enforce',
      },
      'idemp-key-duplicate'
    );

    const res2 = AccountRepository.createAccountWithRuleSet(
      {
        userId: 'user-unit-test',
        label: 'Should Not Create',
        brokerOrFirmId: 'ftmo',
        accountType: 'evaluation',
        baseCurrency: 'USD',
        startingBalance: '50000.00',
        phase: 2,
        phaseStatus: 'active',
      },
      {
        createdBy: 'trader',
        dailyLossMode: 'pct_day_start',
        dailyLossValue: '5.0',
        dailyResetLocalTime: '00:00',
        dailyResetTimezone: 'UTC',
        totalLossMode: 'static_start',
        totalLossValue: '10.0',
        warnThresholdPct: 80,
        enforcement: 'enforce',
      },
      'idemp-key-duplicate'
    );

    expect(res2.account.id).toBe(res1.account.id);
    expect(res2.account.label).toBe('Duplicate Key Test');
  });

  // Test 2: Optimistic Locking with version (If-Match)
  it('enforces version matching and rejects stale updates with 412', () => {
    const accounts = AccountRepository.getAllAccounts();
    const target = accounts[0];

    // Attempt update with wrong version
    const staleResult = AccountRepository.updateAccount(
      target.id,
      target.version + 999, // Stale version
      { label: 'Hacked Label' }
    );

    expect(staleResult.success).toBe(false);
    expect(staleResult.status).toBe(412);
    expect(staleResult.error).toContain('Precondition Failed: version mismatch');

    // Valid version update succeeds and increments version
    const validResult = AccountRepository.updateAccount(
      target.id,
      target.version,
      { label: 'Updated Valid Label' }
    );

    expect(validResult.success).toBe(true);
    expect(validResult.account?.version).toBe(target.version + 1);
    expect(validResult.account?.label).toBe('Updated Valid Label');
  });

  // Test 3: Versioned RuleSet creation (never overwrites)
  it('creates new RuleSet version without overwriting previous versions', () => {
    const accounts = AccountRepository.getAllAccounts();
    const target = accounts[0];

    const currentSets = AccountRepository.getAllRuleSets(target.id);
    const initialVersionCount = currentSets.length;

    const { ruleSet: v2 } = AccountRepository.createRuleSetVersion(target.id, {
      createdBy: 'trader',
      dailyLossMode: 'pct_day_start',
      dailyLossValue: '4.0', // Stricter daily limit
      dailyResetLocalTime: '00:00',
      dailyResetTimezone: 'UTC',
      totalLossMode: 'trailing_peak',
      totalLossValue: '4.5',
      warnThresholdPct: 75,
      enforcement: 'enforce',
    });

    const updatedSets = AccountRepository.getAllRuleSets(target.id);
    expect(updatedSets.length).toBe(initialVersionCount + 1);
    expect(v2.version).toBe(2);
    expect(v2.dailyLossValue).toBe('4.0');
    expect(AccountRepository.getActiveRuleSet(target.id)?.version).toBe(2);
  });

  // Test 4: Server execution gate enforcement - 423 Locked when limit breached
  it('blocks execution with 423 Locked when enforce mode is active and gate is breached', () => {
    const acc = AccountRepository.createAccountWithRuleSet(
      {
        userId: 'trader-lock-test',
        label: 'Lockout Test Account',
        brokerOrFirmId: 'apex',
        accountType: 'funded',
        baseCurrency: 'USD',
        startingBalance: '100000.00',
        phase: 1,
        phaseStatus: 'active',
      },
      {
        createdBy: 'trader',
        dailyLossMode: 'pct_day_start',
        dailyLossValue: '5.0', // $5,000 limit
        dailyResetLocalTime: '00:00',
        dailyResetTimezone: 'UTC',
        totalLossMode: 'static_start',
        totalLossValue: '10.0',
        warnThresholdPct: 80,
        enforcement: 'enforce',
      }
    ).account;

    // First execution: small loss of $1,000 -> allowed
    const exec1 = AccountRepository.recordExecution(acc.id, {
      price: 2000,
      size: 1,
      realizedPnl: -1000,
    });
    expect(exec1.allowed).toBe(true);
    expect(exec1.gateState.dailyLossUsedAmount).toBe('1000.00');

    // Second execution: huge loss of -$4,500 (total loss $5,500 > $5,000 daily limit)
    const exec2 = AccountRepository.recordExecution(acc.id, {
      price: 2000,
      size: 1,
      realizedPnl: -4500,
    });
    // This trade breached the daily limit
    expect(exec2.allowed).toBe(true); // this trade realized the loss and locked the gate

    // Third execution: attempt to record after breach while locked
    const exec3 = AccountRepository.recordExecution(acc.id, {
      price: 2000,
      size: 1,
      realizedPnl: 100,
    });
    // Server must reject with 423 Locked!
    expect(exec3.allowed).toBe(false);
    expect(exec3.status).toBe(423);
    expect((exec3.problemDetails as any).status).toBe(423);
    expect((exec3.problemDetails as any).blocking_rule).toBe('daily_loss');
    expect((exec3.problemDetails as any).next_reset_at).toBeDefined();
  });

  // Test 5: warn_only mode allows writes despite breach and flags warning in audit
  it('allows execution writes under warn_only mode with logged warning audit event', () => {
    const acc = AccountRepository.createAccountWithRuleSet(
      {
        userId: 'trader-warn-only',
        label: 'Warn Only Test Account',
        brokerOrFirmId: 'apex',
        accountType: 'funded',
        baseCurrency: 'USD',
        startingBalance: '100000.00',
        phase: 1,
        phaseStatus: 'active',
      },
      {
        createdBy: 'trader',
        dailyLossMode: 'pct_day_start',
        dailyLossValue: '2.0', // $2,000 limit
        dailyResetLocalTime: '00:00',
        dailyResetTimezone: 'UTC',
        totalLossMode: 'static_start',
        totalLossValue: '5.0',
        warnThresholdPct: 80,
        enforcement: 'warn_only', // warn only!
      }
    ).account;

    // Blow daily limit
    AccountRepository.recordExecution(acc.id, {
      price: 2000,
      size: 1,
      realizedPnl: -3000,
    });

    // Write another trade
    const exec = AccountRepository.recordExecution(acc.id, {
      price: 2000,
      size: 1,
      realizedPnl: 50,
    });

    expect(exec.allowed).toBe(true);
    const auditLogs = AccountRepository.getAuditEvents(acc.id);
    expect(auditLogs.some((l) => l.eventType === 'gate.blocked_write_warning')).toBe(true);
  });

  // Test 6: Daily Reset Job clears daily loss lock idempotently
  it('executes daily reset job idempotently and captures daily start equity', () => {
    const acc = AccountRepository.createAccountWithRuleSet(
      {
        userId: 'trader-reset-test',
        label: 'Daily Reset Test Account',
        brokerOrFirmId: 'ftmo',
        accountType: 'evaluation',
        baseCurrency: 'USD',
        startingBalance: '100000.00',
        phase: 1,
        phaseStatus: 'active',
      },
      {
        createdBy: 'trader',
        dailyLossMode: 'pct_day_start',
        dailyLossValue: '5.0',
        dailyResetLocalTime: '00:00',
        dailyResetTimezone: 'UTC',
        totalLossMode: 'static_start',
        totalLossValue: '10.0',
        warnThresholdPct: 80,
        enforcement: 'enforce',
      }
    ).account;

    // Run first reset
    const now = new Date('2026-11-24T00:00:00Z');
    const reset1 = runDailyResetJob(acc.id, now);
    expect(reset1.success).toBe(true);
    expect(reset1.alreadyRun).toBeUndefined();

    // Run second reset on same day -> idempotent!
    const reset2 = runDailyResetJob(acc.id, now);
    expect(reset2.success).toBe(true);
    expect(reset2.alreadyRun).toBe(true);
  });
});
