import {
  PersonalizedAccount,
  RuleSet,
  FirmRuleTemplate,
  GateState,
  AuditEvent,
  EnforcementMode,
} from '../types/gate';
import {
  computeGateState,
  validateRuleSetAgainstFirmCeiling,
  calculateNextResetInstant,
} from '../calculations/gateEngine';

export const SEED_FIRM_TEMPLATES: FirmRuleTemplate[] = [
  {
    id: 'firm-apex-p1',
    firmId: 'apex',
    firmName: 'Apex Trader Funding',
    phase: 1,
    dailyLossPct: 5.0,
    totalLossPct: 5.0,
    totalLossMode: 'trailing_peak',
    profitTargetPct: 6.0,
    minTradingDays: 7,
    maxRiskPerTradePct: 2.0,
    newsRestricted: false,
    weekendHold: false,
  },
  {
    id: 'firm-apex-funded',
    firmId: 'apex',
    firmName: 'Apex Trader Funding',
    phase: null,
    dailyLossPct: 5.0,
    totalLossPct: 5.0,
    totalLossMode: 'trailing_peak',
    profitTargetPct: null,
    minTradingDays: null,
    maxRiskPerTradePct: 2.0,
    newsRestricted: false,
    weekendHold: false,
  },
  {
    id: 'firm-ftmo-p1',
    firmId: 'ftmo',
    firmName: 'FTMO',
    phase: 1,
    dailyLossPct: 5.0,
    totalLossPct: 10.0,
    totalLossMode: 'static_start',
    profitTargetPct: 10.0,
    minTradingDays: 4,
    maxRiskPerTradePct: 1.5,
    newsRestricted: true,
    weekendHold: false,
  },
  {
    id: 'firm-ftmo-p2',
    firmId: 'ftmo',
    firmName: 'FTMO',
    phase: 2,
    dailyLossPct: 5.0,
    totalLossPct: 10.0,
    totalLossMode: 'static_start',
    profitTargetPct: 5.0,
    minTradingDays: 4,
    maxRiskPerTradePct: 1.5,
    newsRestricted: true,
    weekendHold: false,
  },
  {
    id: 'firm-ftmo-funded',
    firmId: 'ftmo',
    firmName: 'FTMO',
    phase: null,
    dailyLossPct: 5.0,
    totalLossPct: 10.0,
    totalLossMode: 'static_start',
    profitTargetPct: null,
    minTradingDays: null,
    maxRiskPerTradePct: 1.5,
    newsRestricted: false,
    weekendHold: true,
  },
  {
    id: 'firm-topstep-p1',
    firmId: 'topstep',
    firmName: 'Topstep',
    phase: 1,
    dailyLossPct: 4.0,
    totalLossPct: 6.0,
    totalLossMode: 'trailing_peak',
    profitTargetPct: 6.0,
    minTradingDays: 5,
    maxRiskPerTradePct: 2.0,
    newsRestricted: true,
    weekendHold: false,
  },
  {
    id: 'firm-fundednext-p1',
    firmId: 'fundednext',
    firmName: 'FundedNext',
    phase: 1,
    dailyLossPct: 5.0,
    totalLossPct: 10.0,
    totalLossMode: 'static_start',
    profitTargetPct: 10.0,
    minTradingDays: 5,
    maxRiskPerTradePct: 2.0,
    newsRestricted: false,
    weekendHold: true,
  },
];

// In-memory persistent state (shared across hot reloads in dev/test)
interface RepositoryState {
  accounts: Map<string, PersonalizedAccount>;
  rulesets: Map<string, RuleSet[]>; // accountId -> RuleSet[] (versioned)
  gateCache: Map<string, { state: GateState; cachedAt: number }>;
  auditEvents: AuditEvent[];
  idempotencyKeys: Map<string, { response: unknown; createdAt: number }>;
  dailyResetHistory: Set<string>; // accountId:reset_date
  executions: Map<string, Array<{ id: string; price: number; size: number; pnl: number; time: string }>>;
}

const globalForRepo = global as unknown as { __edgeledger_repo_state__?: RepositoryState };

function getInitialState(): RepositoryState {
  if (!globalForRepo.__edgeledger_repo_state__) {
    const defaultAccounts = new Map<string, PersonalizedAccount>();
    const defaultRulesets = new Map<string, RuleSet[]>();
    const defaultGateCache = new Map<string, { state: GateState; cachedAt: number }>();
    const defaultExecutions = new Map<string, Array<{ id: string; price: number; size: number; pnl: number; time: string }>>();

    // Seed initial account
    const accId = 'acc-apex-100k';
    const initialAccount: PersonalizedAccount = {
      id: accId,
      userId: 'user-default',
      label: 'Apex 100K Funded Live #1',
      brokerOrFirmId: 'apex',
      accountType: 'funded',
      baseCurrency: 'USD',
      startingBalance: '100000.00',
      currentBalance: '103450.00',
      currentEquity: '103450.00',
      peakEquity: '104200.00',
      dailyStartEquity: '102500.00',
      phase: 1,
      phaseStatus: 'active',
      notes: 'Focus on NQ & ES breakouts during London/NY crossover.',
      version: 1,
      createdAt: '2026-11-20T08:00:00Z',
      updatedAt: '2026-11-24T08:00:00Z',
    };

    const initialRuleSet: RuleSet = {
      id: 'ruleset-apex-1',
      accountId: accId,
      version: 1,
      createdBy: 'user-default',
      createdAt: '2026-11-20T08:00:00Z',
      effectiveFrom: '2026-11-20T08:00:00Z',
      dailyLossMode: 'pct_day_start',
      dailyLossValue: '5.0', // 5% = $5,125
      dailyResetLocalTime: '00:00',
      dailyResetTimezone: 'UTC',
      totalLossMode: 'trailing_peak',
      totalLossValue: '5.0', // 5% trailing from peak $104,200
      warnThresholdPct: 80,
      enforcement: 'enforce',
      profitTargetValue: '6.0',
      minTradingDays: 7,
      maxRiskPerTradePct: '2.0',
      isActive: true,
    };

    defaultAccounts.set(accId, initialAccount);
    defaultRulesets.set(accId, [initialRuleSet]);
    defaultExecutions.set(accId, [
      { id: 'exec-1', price: 21050.25, size: 2, pnl: 950.0, time: '2026-11-24T09:30:00Z' },
    ]);

    globalForRepo.__edgeledger_repo_state__ = {
      accounts: defaultAccounts,
      rulesets: defaultRulesets,
      gateCache: defaultGateCache,
      auditEvents: [],
      idempotencyKeys: new Map(),
      dailyResetHistory: new Set(),
      executions: defaultExecutions,
    };
  }
  return globalForRepo.__edgeledger_repo_state__;
}

const state = getInitialState();

export class AccountRepository {
  static getFirmTemplate(firmId: string, phase: number | null): FirmRuleTemplate | null {
    const fId = (firmId || '').toLowerCase();
    const match = SEED_FIRM_TEMPLATES.find(
      (t) => t.firmId === fId && (t.phase === phase || (t.phase === null && phase === null))
    );
    if (match) return match;
    // Fallback to null phase (funded) if specific phase not found
    return SEED_FIRM_TEMPLATES.find((t) => t.firmId === fId) || null;
  }

  static getAccount(id: string): PersonalizedAccount | null {
    return state.accounts.get(id) || null;
  }

  static getAllAccounts(): PersonalizedAccount[] {
    return Array.from(state.accounts.values());
  }

  static getActiveRuleSet(accountId: string): RuleSet | null {
    const sets = state.rulesets.get(accountId);
    if (!sets || sets.length === 0) return null;
    // Latest active version
    return sets.slice().sort((a, b) => b.version - a.version)[0] || null;
  }

  static getAllRuleSets(accountId: string): RuleSet[] {
    return state.rulesets.get(accountId) || [];
  }

  static getGateState(accountId: string, forceRecompute: boolean = false): GateState | null {
    const now = Date.now();
    const cached = state.gateCache.get(accountId);
    if (!forceRecompute && cached && now - cached.cachedAt < 5000) {
      return cached.state;
    }

    const account = this.getAccount(accountId);
    if (!account) return null;
    const ruleSet = this.getActiveRuleSet(accountId);
    if (!ruleSet) return null;

    const firmTemplate = account.brokerOrFirmId
      ? this.getFirmTemplate(account.brokerOrFirmId, account.phase)
      : null;

    const gateState = computeGateState({
      account,
      ruleSet,
      firmTemplate,
      currentEquity: account.currentEquity,
      peakEquity: account.peakEquity,
      dailyStartEquity: account.dailyStartEquity,
      openFloatingPnl: '0.00',
      now: new Date(),
    });

    state.gateCache.set(accountId, { state: gateState, cachedAt: now });
    return gateState;
  }

  static createAccountWithRuleSet(
    accountData: Omit<PersonalizedAccount, 'id' | 'version' | 'createdAt' | 'updatedAt' | 'peakEquity' | 'dailyStartEquity' | 'currentBalance' | 'currentEquity'>,
    ruleSetData: Omit<RuleSet, 'id' | 'accountId' | 'version' | 'createdAt' | 'effectiveFrom' | 'isActive'>,
    idempotencyKey?: string
  ): { account: PersonalizedAccount; ruleSet: RuleSet; gateState: GateState } {
    if (idempotencyKey && state.idempotencyKeys.has(idempotencyKey)) {
      return state.idempotencyKeys.get(idempotencyKey)!.response as {
        account: PersonalizedAccount;
        ruleSet: RuleSet;
        gateState: GateState;
      };
    }

    const accountId = `acc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();

    const account: PersonalizedAccount = {
      ...accountData,
      id: accountId,
      currentBalance: accountData.startingBalance,
      currentEquity: accountData.startingBalance,
      peakEquity: accountData.startingBalance,
      dailyStartEquity: accountData.startingBalance,
      version: 1,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const ruleSet: RuleSet = {
      ...ruleSetData,
      id: `ruleset-${accountId}-v1`,
      accountId,
      version: 1,
      createdAt: nowIso,
      effectiveFrom: nowIso,
      isActive: true,
    };

    state.accounts.set(accountId, account);
    state.rulesets.set(accountId, [ruleSet]);

    const gateState = this.getGateState(accountId, true)!;

    this.recordAuditEvent({
      accountId,
      actor: accountData.userId || 'trader',
      eventType: 'account.created',
      beforeState: null,
      afterState: { account, ruleSet },
      reason: 'Provisioned new trading account with personalized RuleSet v1',
    });

    const result = { account, ruleSet, gateState };
    if (idempotencyKey) {
      state.idempotencyKeys.set(idempotencyKey, { response: result, createdAt: Date.now() });
    }

    return result;
  }

  static updateAccount(
    id: string,
    expectedVersion: number,
    updates: Partial<Pick<PersonalizedAccount, 'label' | 'phase' | 'phaseStatus' | 'notes'>>,
    actor: string = 'trader'
  ): { success: boolean; account?: PersonalizedAccount; error?: string; status?: number } {
    const existing = state.accounts.get(id);
    if (!existing) {
      return { success: false, error: 'Account not found', status: 404 };
    }

    if (existing.version !== expectedVersion) {
      return {
        success: false,
        error: `Precondition Failed: version mismatch. Current version is ${existing.version}, expected ${expectedVersion}.`,
        status: 412,
      };
    }

    const before = { ...existing };
    const updated: PersonalizedAccount = {
      ...existing,
      ...updates,
      version: existing.version + 1,
      updatedAt: new Date().toISOString(),
    };

    state.accounts.set(id, updated);
    state.gateCache.delete(id); // invalidate gate cache

    this.recordAuditEvent({
      accountId: id,
      actor,
      eventType: 'account.updated',
      beforeState: before,
      afterState: updated,
      reason: updates.phaseStatus ? `Phase status updated to ${updates.phaseStatus}` : 'Account fields updated',
    });

    return { success: true, account: updated };
  }

  static deleteAccount(id: string, actor: string = 'trader'): boolean {
    const existing = state.accounts.get(id);
    if (!existing) return false;

    state.accounts.delete(id);
    state.rulesets.delete(id);
    state.gateCache.delete(id);
    state.executions.delete(id);

    this.recordAuditEvent({
      accountId: id,
      actor,
      eventType: 'account.deleted',
      beforeState: existing,
      afterState: null,
      reason: 'Account deleted by trader',
    });

    return true;
  }

  static createRuleSetVersion(
    accountId: string,
    ruleSetDraft: Omit<RuleSet, 'id' | 'accountId' | 'version' | 'createdAt' | 'effectiveFrom' | 'isActive'>,
    actor: string = 'trader'
  ): { ruleSet: RuleSet; gateState: GateState } {
    const account = state.accounts.get(accountId);
    if (!account) {
      throw new Error(`Account "${accountId}" not found`);
    }

    const currentSets = state.rulesets.get(accountId) || [];
    const latestVersion = currentSets.reduce((max, r) => Math.max(max, r.version), 0);
    const newVersion = latestVersion + 1;
    const now = new Date();
    const nowIso = now.toISOString();

    // Check if account is in active daily block ('locked')
    const currentGate = this.getGateState(accountId);
    let effectiveFrom = nowIso;

    if (currentGate && currentGate.status === 'locked') {
      const activeSet = this.getActiveRuleSet(accountId);
      // If new daily limit is looser than activeSet, it takes effect at next reset
      const oldDailyVal = Number(activeSet?.dailyLossValue || 0);
      const newDailyVal = Number(ruleSetDraft.dailyLossValue);
      if (newDailyVal > oldDailyVal) {
        effectiveFrom = currentGate.nextResetAt;
      }
    }

    const newRuleSet: RuleSet = {
      ...ruleSetDraft,
      id: `ruleset-${accountId}-v${newVersion}`,
      accountId,
      version: newVersion,
      createdAt: nowIso,
      effectiveFrom,
      isActive: true,
    };

    // Append-only: never update in place
    state.rulesets.set(accountId, [...currentSets, newRuleSet]);
    state.gateCache.delete(accountId);

    const updatedGate = this.getGateState(accountId, true)!;

    this.recordAuditEvent({
      accountId,
      actor,
      eventType: 'ruleset.versioned',
      beforeState: this.getActiveRuleSet(accountId),
      afterState: newRuleSet,
      reason: `Version ${newVersion} created with effective_from ${effectiveFrom}`,
    });

    return { ruleSet: newRuleSet, gateState: updatedGate };
  }

  static recordExecution(
    accountId: string,
    execution: { price: number; size: number; realizedPnl: number; executionTime?: string }
  ): { allowed: boolean; status: number; gateState: GateState; executionId?: string; error?: string; problemDetails?: unknown } {
    const account = state.accounts.get(accountId);
    if (!account) {
      return { allowed: false, status: 404, gateState: {} as GateState, error: 'Account not found' };
    }

    const ruleSet = this.getActiveRuleSet(accountId);
    if (!ruleSet) {
      return { allowed: false, status: 404, gateState: {} as GateState, error: 'RuleSet not found' };
    }

    // Gate check!
    const currentGate = this.getGateState(accountId, true)!;

    if (currentGate.status === 'blocked' || currentGate.status === 'locked') {
      if (ruleSet.enforcement === 'enforce') {
        const problemDetails = {
          type: 'https://edgeledger.com/errors/trading-locked',
          title: 'Trading Gate Locked',
          status: 423,
          detail: `Recording new executions is locked for this account. Blocking rule: ${currentGate.blockingRule || 'limit_breached'}.`,
          blocking_rule: currentGate.blockingRule,
          next_reset_at: currentGate.nextResetAt,
        };

        this.recordAuditEvent({
          accountId,
          actor: 'server_enforcement',
          eventType: 'gate.blocked_write',
          beforeState: currentGate,
          afterState: null,
          reason: `Rejected execution write under enforce mode due to gate status "${currentGate.status}".`,
        });

        return {
          allowed: false,
          status: 423,
          gateState: currentGate,
          problemDetails,
        };
      } else {
        // warn_only: write succeeds with status = blocked and warning flag
        this.recordAuditEvent({
          accountId,
          actor: 'trader',
          eventType: 'gate.blocked_write_warning',
          beforeState: currentGate,
          afterState: execution,
          reason: `Recorded execution despite gate status "${currentGate.status}" because enforcement is warn_only.`,
        });
      }
    }

    // Apply execution
    const execId = `exec-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const execList = state.executions.get(accountId) || [];
    execList.push({
      id: execId,
      price: execution.price,
      size: execution.size,
      pnl: execution.realizedPnl,
      time: execution.executionTime || new Date().toISOString(),
    });
    state.executions.set(accountId, execList);

    // Update account equity and balance
    const newBal = (Number(account.currentBalance) + execution.realizedPnl).toFixed(2);
    const newEq = (Number(account.currentEquity) + execution.realizedPnl).toFixed(2);
    const newPeak = Math.max(Number(account.peakEquity), Number(newEq)).toFixed(2);

    account.currentBalance = newBal;
    account.currentEquity = newEq;
    account.peakEquity = newPeak;
    account.updatedAt = new Date().toISOString();
    state.accounts.set(accountId, account);

    state.gateCache.delete(accountId);
    const newGate = this.getGateState(accountId, true)!;

    return {
      allowed: true,
      status: 201,
      executionId: execId,
      gateState: newGate,
    };
  }

  static recordAuditEvent(event: Omit<AuditEvent, 'id' | 'createdAt'>): AuditEvent {
    const auditEvent: AuditEvent = {
      ...event,
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      createdAt: new Date().toISOString(),
    };
    state.auditEvents.push(auditEvent);
    return auditEvent;
  }

  static getAuditEvents(accountId?: string): AuditEvent[] {
    if (!accountId) return [...state.auditEvents];
    return state.auditEvents.filter((e) => e.accountId === accountId);
  }

  static executeDailyReset(accountId: string, now: Date = new Date()): { success: boolean; dailyStartEquity?: string; alreadyRun?: boolean } {
    const account = state.accounts.get(accountId);
    if (!account) return { success: false };

    const ruleSet = this.getActiveRuleSet(accountId);
    if (!ruleSet) return { success: false };

    const resetDateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const idempotencyKey = `${accountId}:${resetDateStr}`;

    if (state.dailyResetHistory.has(idempotencyKey)) {
      return { success: true, alreadyRun: true, dailyStartEquity: account.dailyStartEquity };
    }

    // Capture dailyStartEquity
    const capturedEquity = account.currentEquity;
    account.dailyStartEquity = capturedEquity;
    account.updatedAt = now.toISOString();
    state.accounts.set(accountId, account);

    state.dailyResetHistory.add(idempotencyKey);
    state.gateCache.delete(accountId);

    this.recordAuditEvent({
      accountId,
      actor: 'daily_reset_job',
      eventType: 'gate.daily_reset',
      beforeState: { previousDailyStart: account.dailyStartEquity },
      afterState: { newDailyStartEquity: capturedEquity },
      reason: `Captured start-of-day equity for ${resetDateStr}`,
    });

    return { success: true, dailyStartEquity: capturedEquity };
  }
}
