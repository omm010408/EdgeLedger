'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useTrading } from '../../context/TradingContext';
import {
  Wallet,
  ShieldCheck,
  ShieldAlert,
  Plus,
  TrendingUp,
  Percent,
  CheckCircle,
  AlertTriangle,
  Settings,
  Trash2,
  Sliders,
  Check
} from 'lucide-react';
import { NewAccountModal } from '../../components/modals/NewAccountModal';
import { DeleteConfirmButton } from '../../components/ui/DeleteConfirmButton';
import { TradingAccount, AccountRule } from '../../lib/types/financial';

const ACCOUNT_LINE_COLORS = [
  'var(--tw-hero-line)', // #9BF3DF
  'var(--tw-sun)',       // #FFD56B
  'var(--tw-ink)',       // #FFFFFF
  'var(--tw-s3)',        // #9085E9
  'var(--tw-gain)',      // #5BE6AE
];

export default function AccountsPage() {
  const {
    accounts,
    selectedAccountId,
    setSelectedAccountId,
    trades,
    portfolioMetrics,
    riskAlerts,
    isPnlHidden,
    deleteAccount,
    toggleRule,
    deleteRule
  } = useTrading();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const accId = new URLSearchParams(window.location.search).get('accountId');
    if (accId && accounts.some((a) => a.id === accId)) {
      setSelectedAccountId(accId);
    }
  }, [accounts, setSelectedAccountId]);

  const [newAccountModalOpen, setNewAccountModalOpen] = useState(false);
  const [editingRuleAccount, setEditingRuleAccount] = useState<TradingAccount | null>(null);

  const activeEditingRuleAccount = useMemo(
    () => (editingRuleAccount ? accounts.find((a) => a.id === editingRuleAccount.id) || null : null),
    [accounts, editingRuleAccount]
  );

  // Dynamic Portfolio Equity & Capital Share
  const portfolioSummary = useMemo(() => {
    const totalEquity = accounts.reduce((sum, a) => sum + a.currentEquity, 0);
    const totalStart = accounts.reduce((sum, a) => sum + a.startingBalance, 0);
    const netGain = totalEquity - totalStart;
    const gainPct = totalStart > 0 ? (netGain / totalStart) * 100 : 0;

    const shares = accounts.map((acc, idx) => {
      const pct = totalEquity > 0 ? (acc.currentEquity / totalEquity) * 100 : 0;
      const color = ACCOUNT_LINE_COLORS[idx % ACCOUNT_LINE_COLORS.length];
      return {
        id: acc.id,
        name: acc.name,
        equity: acc.currentEquity,
        pct: Math.round(pct * 10) / 10,
        color,
      };
    });

    // Total active rules and safe rules
    let totalRules = 0;
    let safeRules = 0;
    const ruleBreakdown: string[] = [];

    accounts.forEach((acc) => {
      const activeRules = acc.rules.filter((r) => r.isEnabled);
      totalRules += activeRules.length;
      safeRules += activeRules.filter((r) => r.currentStatus === 'SAFE').length;
      ruleBreakdown.push(`${acc.name.split(' ')[0]} ${activeRules.length}`);
    });

    const totalClosed = trades.filter((t) => t.status === 'CLOSED').length;

    return {
      totalEquity,
      totalStart,
      netGain,
      gainPct,
      shares,
      totalRules,
      safeRules,
      ruleBreakdown: ruleBreakdown.join(', '),
      totalClosed,
    };
  }, [accounts, trades]);

  const formatCurrency = (val: number, options?: { showCents?: boolean }) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: options?.showCents === false ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(val);
  };

  return (
    <div className="space-y-6 -mt-2">
      {/* 1. Page Header & Primary Provision Button */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b border-[var(--tw-line)]">
        <div>
          <div className="flex items-center space-x-2">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ background: 'var(--tw-hero-line)' }}
            />
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[var(--tw-ink)] font-sans">
              Multi-account desk
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-[var(--tw-ink-2)] mt-1 font-sans">
            Independent account segregation, prop-firm rules and risk limits for each desk.
          </p>
        </div>

        <button
          onClick={() => setNewAccountModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-full bg-[var(--tw-ink)] text-[var(--tw-tile)] hover:opacity-90 font-sans font-semibold text-xs sm:text-sm transition-all shadow-md self-start sm:self-auto cursor-pointer"
        >
          <Plus size={16} />
          <span>+ Provision account</span>
        </button>
      </div>

      {/* 2. TOP ROW BENTO GRID (Summary Tiles) */}
      <div className="grid grid-cols-1 md:grid-cols-6 lg:grid-cols-12 gap-4">
        {/* HERO TILE: PORTFOLIO EQUITY (Cols 1-6) */}
        <section
          aria-label="Portfolio equity"
          className="md:col-span-6 lg:col-span-6 rounded-[36px] sm:rounded-[44px] p-6 sm:p-7 flex flex-col justify-between shadow-2xl relative overflow-hidden"
          style={{
            backgroundColor: 'var(--tw-hero)',
            color: 'var(--tw-hero-ink)',
            border: '1px solid rgba(155, 243, 223, 0.2)',
          }}
        >
          <div>
            <div className="text-xs font-semibold tracking-wide" style={{ color: 'var(--tw-hero-2)' }}>
              Portfolio equity, {accounts.length} accounts
            </div>

            <div className="mt-2 text-4xl sm:text-6xl font-bold font-mono tracking-tight text-white flex items-baseline">
              {isPnlHidden ? (
                <span>$••••••</span>
              ) : (
                <>
                  <span>{formatCurrency(portfolioSummary.totalEquity).split('.')[0]}</span>
                  <span className="text-2xl sm:text-3xl font-medium ml-1" style={{ color: 'var(--tw-hero-2)' }}>
                    .{formatCurrency(portfolioSummary.totalEquity).split('.')[1]}
                  </span>
                </>
              )}
            </div>

            <div className="mt-3 flex items-center gap-2 text-xs sm:text-sm">
              <span
                className="inline-flex items-center px-3 py-1 rounded-full text-xs font-mono font-bold"
                style={{ background: 'var(--tw-hero-chip)', color: 'var(--tw-hero-ink)' }}
              >
                {isPnlHidden
                  ? '+$••••.•• (•••%)'
                  : `${portfolioSummary.netGain >= 0 ? '+' : ''}${formatCurrency(portfolioSummary.netGain)} (${portfolioSummary.gainPct >= 0 ? '+' : ''}${portfolioSummary.gainPct.toFixed(1)}%)`}
              </span>
              <span style={{ color: 'var(--tw-hero-2)' }}>
                across a {formatCurrency(portfolioSummary.totalStart)} start
              </span>
            </div>
          </div>

          {/* Share of Equity Bar & Legend */}
          <div className="mt-6 pt-4 border-t border-white/20">
            <div className="text-xs font-semibold mb-2" style={{ color: 'var(--tw-hero-2)' }}>
              Share of equity by account
            </div>

            {/* Segmented Bar */}
            <div
              className="flex h-3 rounded-full overflow-hidden p-0.5 gap-1"
              style={{ background: 'var(--tw-hero-chip)' }}
            >
              {portfolioSummary.shares.map((share) => (
                <span
                  key={share.id}
                  style={{ width: `${share.pct}%`, backgroundColor: share.color }}
                  className="rounded-full h-full transition-all"
                  title={`${share.name}: ${share.pct}%`}
                />
              ))}
            </div>

            {/* 3-Account Legend */}
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 font-mono text-xs">
              {portfolioSummary.shares.map((share) => (
                <div key={share.id} className="flex items-start gap-2">
                  <i
                    className="w-2.5 h-2.5 rounded-full mt-1 shrink-0"
                    style={{ backgroundColor: share.color }}
                  />
                  <div>
                    <dt className="text-[11px] truncate" style={{ color: 'var(--tw-hero-2)' }}>
                      {share.name.split(' ')[0]} {share.name.split(' ')[1] || ''}, {share.pct}%
                    </dt>
                    <dd className="font-bold text-white text-sm mt-0.5">
                      {formatCurrency(share.equity)}
                    </dd>
                  </div>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* SUMMARY TILE 2: OPEN RISK (Cols 7-8) — Sun Yellow */}
        <section
          aria-label="Open risk"
          className="md:col-span-2 lg:col-span-2 rounded-[32px] p-6 flex flex-col justify-between shadow-lg"
          style={{
            backgroundColor: 'var(--tw-sun)',
            color: 'var(--tw-sun-ink)',
            minHeight: '220px',
          }}
        >
          <div className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--tw-sun-ink)' }}>
            Open risk
          </div>

          <div className="text-4xl font-mono font-bold tracking-tight" style={{ color: 'var(--tw-sun-ink)' }}>
            {formatCurrency(portfolioMetrics.openRiskUsd)}
          </div>

          <div className="text-xs font-sans font-medium" style={{ color: 'var(--tw-sun-ink)' }}>
            {portfolioSummary.totalEquity > 0
              ? `${(portfolioMetrics.openRiskUsd / portfolioSummary.totalEquity * 100).toFixed(2)}% of balance`
              : '0.00%'}
          </div>
        </section>

        {/* SUMMARY TILE 3: RULE LIMITS (Cols 9-10) — Aqua Mint */}
        <section
          aria-label="Rule limits"
          className="md:col-span-2 lg:col-span-2 rounded-[32px] p-6 flex flex-col justify-between shadow-lg"
          style={{
            backgroundColor: 'var(--tw-aqua)',
            color: 'var(--tw-aqua-ink)',
            minHeight: '220px',
          }}
        >
          <div className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--tw-aqua-ink)' }}>
            Rule limits
          </div>

          <div className="text-4xl font-mono font-bold tracking-tight" style={{ color: 'var(--tw-aqua-num)' }}>
            {portfolioSummary.safeRules} of {portfolioSummary.totalRules}
          </div>

          <div className="text-xs font-sans font-medium truncate" style={{ color: 'var(--tw-aqua-ink)' }}>
            {portfolioSummary.ruleBreakdown}
          </div>
        </section>

        {/* SUMMARY TILE 4: ACTIVE DESKS (Cols 11-12) — Dynamic Tile */}
        <section
          aria-label="Active desks"
          className="tw-tile md:col-span-2 lg:col-span-2 justify-between"
          style={{ minHeight: '220px' }}
        >
          <div className="text-xs font-bold uppercase tracking-wide text-[var(--tw-ink-2)]">
            Active desks
          </div>

          <div className="text-4xl font-mono font-bold tracking-tight text-[var(--tw-ink)]">
            {accounts.length}
          </div>

          <div className="text-xs font-sans text-[var(--tw-ink-3)]">
            {portfolioSummary.totalClosed} closed trades in total
          </div>
        </section>
      </div>

      {/* 3. BOTTOM ROW: INDIVIDUAL ACCOUNT CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 pt-2">
        {accounts.map((acc) => {
          const accTrades = trades.filter((t) =>
            t.allocations.some((a) => a.accountId === acc.id)
          );
          const closedTrades = accTrades.filter((t) => t.status === 'CLOSED');
          const winCount = closedTrades.filter((t) => {
            const alloc = t.allocations.find((a) => a.accountId === acc.id);
            return alloc && alloc.netPnl > 0;
          }).length;

          const winRate = closedTrades.length > 0 ? (winCount / closedTrades.length) * 100 : 0;
          const netProfit = acc.currentEquity - acc.startingBalance;
          const returnPct = acc.startingBalance > 0 ? (netProfit / acc.startingBalance) * 100 : 0;
          const currentDd = Math.max(0, acc.highWaterMark - acc.currentEquity);
          const currentDdPct = acc.highWaterMark > 0 ? (currentDd / acc.highWaterMark) * 100 : 0;

          const isSelected = selectedAccountId === acc.id;

          // Determine Phase Tag styling
          const isFunded = acc.accountType === 'funded' || acc.accountType === 'instant_funding' || acc.challengePhase.toLowerCase().includes('funded');
          const isEval = acc.accountType === 'prop_evaluation' || acc.accountType === 'prop_verification';

          return (
            <div
              key={acc.id}
              className={`rounded-[32px] p-6 border transition-all flex flex-col justify-between space-y-5 bg-[var(--tw-tile)] ${
                isSelected
                  ? 'border-[var(--tw-hero-line)] shadow-glow'
                  : 'border-[var(--tw-line)] hover:border-[var(--tw-line-strong)]'
              }`}
            >
              {/* Account Card Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <h2 className="text-lg sm:text-xl font-bold font-sans tracking-tight text-[var(--tw-ink)]">
                    {acc.name}
                  </h2>
                  <p className="text-xs text-[var(--tw-ink-3)] font-sans">
                    {acc.brokerOrFirm}, {acc.challengePhase}
                  </p>
                </div>

                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    isFunded
                      ? 'bg-[var(--tw-sun)] text-[var(--tw-sun-ink)]'
                      : isEval
                      ? 'bg-[var(--tw-warn-bg)] text-[var(--tw-warn)] border border-[var(--tw-warn-line)]'
                      : 'bg-[var(--tw-pill)] text-[var(--tw-ink-2)] border border-[var(--tw-line)]'
                  }`}
                >
                  {isFunded ? 'Funded' : isEval ? 'Prop evaluation' : 'Personal'}
                </span>
              </div>

              {/* Equity & Return Metrics Row */}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-[var(--tw-line)] font-mono">
                <div>
                  <div className="text-xs text-[var(--tw-ink-2)]">Equity</div>
                  <div className="text-xl sm:text-2xl font-bold text-[var(--tw-ink)] mt-1 tabular-nums">
                    {isPnlHidden ? '$••••••' : formatCurrency(acc.currentEquity)}
                  </div>
                  <small className="text-[11px] text-[var(--tw-ink-3)] block mt-1">
                    Start {formatCurrency(acc.startingBalance)}
                  </small>
                </div>

                <div className="text-right">
                  <div className="text-xs text-[var(--tw-ink-2)]">Net gain</div>
                  <div className={`text-base sm:text-lg font-bold mt-1 tabular-nums ${netProfit >= 0 ? 'text-[var(--tw-gain)]' : 'text-[var(--tw-loss)]'}`}>
                    {isPnlHidden
                      ? '••••••'
                      : `${netProfit >= 0 ? '+' : ''}${formatCurrency(netProfit)} (${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(1)}%)`}
                  </div>
                  <small className="text-[11px] text-[var(--tw-ink-3)] block mt-1">
                    Drawdown {currentDdPct.toFixed(1)}%, {isPnlHidden ? '$•••' : formatCurrency(currentDd)}
                  </small>
                </div>
              </div>

              {/* Mini Metrics Strip (Trades, Win Rate, Peak Eq) */}
              <dl className="grid grid-cols-3 rounded-2xl bg-[var(--tw-pill)] py-3 text-center font-mono border border-[var(--tw-line)]">
                <div>
                  <dt className="text-[11px] text-[var(--tw-ink-3)]">Trades</dt>
                  <dd className="text-sm sm:text-base font-bold text-[var(--tw-ink)] mt-1">{closedTrades.length}</dd>
                </div>
                <div className="border-x border-[var(--tw-line)]">
                  <dt className="text-[11px] text-[var(--tw-ink-3)]">Win rate</dt>
                  <dd className="text-sm sm:text-base font-bold text-[var(--tw-ink)] mt-1">{winRate.toFixed(1)}%</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-[var(--tw-ink-3)]">Peak equity</dt>
                  <dd className="text-sm sm:text-base font-bold text-[var(--tw-ink)] mt-1">
                    ${(acc.highWaterMark / 1000).toFixed(1)}k
                  </dd>
                </div>
              </dl>

              {/* Active Rule Limits List */}
              <div className="space-y-2 pt-1 font-mono text-xs">
                <div className="flex justify-between items-center text-[var(--tw-ink-2)] text-[11px] font-semibold pb-1">
                  <span>Active rule limits ({acc.rules.length})</span>
                  <span>Status</span>
                </div>

                <div className="space-y-1.5 divide-y divide-[var(--tw-line)]">
                  {acc.rules.slice(0, 3).map((r) => (
                    <div key={r.id} className="pt-2 flex justify-between items-center text-[var(--tw-ink-2)]">
                      <span className="truncate pr-2">{r.ruleType.replace(/_/g, ' ')}</span>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          r.currentStatus === 'SAFE'
                            ? 'bg-[var(--tw-aqua)] text-[var(--tw-aqua-ink)]'
                            : r.currentStatus === 'WARNING'
                            ? 'bg-[var(--tw-warn-bg)] text-[var(--tw-warn)] border border-[var(--tw-warn-line)]'
                            : r.currentStatus === 'BREACHED'
                            ? 'bg-[var(--tw-loss)]/15 text-[var(--tw-loss)] border border-[var(--tw-loss)]/60'
                            : 'bg-[var(--tw-pill)] text-[var(--tw-ink-2)]'
                        }`}
                      >
                        {r.currentStatus.toLowerCase()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* CTAs */}
              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => setSelectedAccountId(isSelected ? 'ALL' : acc.id)}
                  className={`flex-1 h-10 rounded-full font-sans font-semibold text-xs tracking-wider transition-all cursor-pointer flex items-center justify-center space-x-1.5 ${
                    isSelected
                      ? 'bg-[var(--tw-hero-line)] text-[var(--tw-hero)] shadow-glow font-bold'
                      : 'bg-[var(--tw-pill)] text-[var(--tw-ink-2)] hover:text-[var(--tw-ink)] border border-[var(--tw-line)]'
                  }`}
                >
                  {isSelected ? (
                    <>
                      <Check size={14} />
                      <span>Active Desk</span>
                    </>
                  ) : (
                    <span>Select desk</span>
                  )}
                </button>

                <Link
                  href={`/risk?accountId=${acc.id}`}
                  onClick={() => setSelectedAccountId(acc.id)}
                  className="px-3 h-10 rounded-full flex items-center justify-center bg-[var(--tw-pill)] border border-[var(--tw-line)] text-[var(--tw-ink-2)] hover:text-[var(--tw-ink)] hover:border-[var(--tw-line-strong)] transition-all text-xs font-medium"
                  title="Inspect Desk Risk & Exposure"
                >
                  Risk
                </Link>

                <button
                  onClick={() => setEditingRuleAccount(acc)}
                  className="w-10 h-10 rounded-full flex items-center justify-center bg-[var(--tw-pill)] border border-[var(--tw-line)] text-[var(--tw-ink-2)] hover:text-[var(--tw-ink)] hover:border-[var(--tw-line-strong)] transition-all cursor-pointer"
                  title="Configure Rules"
                  aria-label="Configure rules"
                >
                  <Settings size={15} />
                </button>

                <DeleteConfirmButton
                  variant="icon"
                  size={15}
                  title="Delete Account"
                  ariaLabel={`Remove ${acc.name}`}
                  className="min-w-10 h-10 rounded-full bg-[var(--tw-pill)] border border-[var(--tw-line)]"
                  onConfirm={() => deleteAccount(acc.id)}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* 4. Rule Engine Configuration Modal */}
      {activeEditingRuleAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-3xl border border-[var(--tw-line)] bg-[var(--tw-tile)] shadow-2xl text-xs p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--tw-line)]">
              <div className="flex items-center space-x-2">
                <ShieldCheck size={18} className="text-[var(--tw-gain)]" />
                <h2 className="font-mono text-sm font-bold tracking-wider text-[var(--tw-ink)] uppercase">
                  RULE ENGINE SURVEILLANCE: {activeEditingRuleAccount.name}
                </h2>
              </div>
              <button
                onClick={() => setEditingRuleAccount(null)}
                className="w-8 h-8 rounded-full bg-[var(--tw-pill)] border border-[var(--tw-line)] text-[var(--tw-ink-2)] hover:text-[var(--tw-ink)] flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <p className="text-[var(--tw-ink-3)] font-sans text-xs leading-relaxed">
              Autonomous risk monitoring rules enforce prop-firm constraints and drawdown thresholds in real time with 4-state evaluation (Safe, Warning, Breached, Unknown).
            </p>

            <div className="space-y-3 font-mono">
              {activeEditingRuleAccount.rules.map((rule) => (
                <div
                  key={rule.id}
                  className="p-3.5 rounded-2xl border border-[var(--tw-line)] bg-[var(--tw-pill)]/60 space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2.5">
                      <input
                        type="checkbox"
                        checked={rule.isEnabled}
                        onChange={() => toggleRule(activeEditingRuleAccount.id, rule.id)}
                        className="rounded border-[var(--tw-line)] text-[var(--tw-gain)] focus:ring-0 cursor-pointer"
                      />
                      <span className="font-bold text-[var(--tw-ink)] uppercase text-xs">
                        {rule.ruleType.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          rule.currentStatus === 'SAFE'
                            ? 'bg-[var(--tw-aqua)] text-[var(--tw-aqua-ink)]'
                            : rule.currentStatus === 'WARNING'
                            ? 'bg-[var(--tw-warn-bg)] text-[var(--tw-warn)]'
                            : rule.currentStatus === 'BREACHED'
                            ? 'bg-[var(--tw-loss)]/15 text-[var(--tw-loss)]'
                            : 'bg-[var(--tw-tile)] text-[var(--tw-ink-2)]'
                        }`}
                      >
                        {rule.currentStatus}
                      </span>
                      <DeleteConfirmButton
                        variant="icon"
                        size={13}
                        title="Delete rule"
                        ariaLabel={`Delete ${rule.ruleType} rule`}
                        onConfirm={() => deleteRule(activeEditingRuleAccount.id, rule.id)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-[11px] text-[var(--tw-ink-3)] pt-1 border-t border-[var(--tw-line)]/50">
                    <div>
                      <span className="block text-[9px] uppercase font-bold text-[var(--tw-ink-2)]">Limit Threshold</span>
                      <span className="font-semibold text-[var(--tw-ink)]">
                        {rule.thresholdUnit === 'percent'
                          ? `${rule.thresholdValue}%`
                          : formatCurrency(rule.thresholdValue)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[9px] uppercase font-bold text-[var(--tw-ink-2)]">Calculation Method</span>
                      <span className="font-semibold text-[var(--tw-ink)]">{rule.calculationMethod}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] uppercase font-bold text-[var(--tw-ink-2)]">Warning Buffer</span>
                      <span className="font-semibold text-[var(--tw-warn)]">{rule.warningThresholdPct}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setEditingRuleAccount(null)}
                className="px-5 py-2.5 rounded-full bg-[var(--tw-ink)] text-[var(--tw-tile)] font-sans font-bold hover:opacity-90 transition-colors shadow-sm"
              >
                Close &amp; Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Provision Account Modal */}
      <NewAccountModal
        isOpen={newAccountModalOpen}
        onClose={() => setNewAccountModalOpen(false)}
      />
    </div>
  );
}
