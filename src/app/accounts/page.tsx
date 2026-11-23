'use client';

import React, { useState, useMemo } from 'react';
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
    deleteAccount,
    toggleRule
  } = useTrading();

  const [newAccountModalOpen, setNewAccountModalOpen] = useState(false);
  const [editingRuleAccount, setEditingRuleAccount] = useState<TradingAccount | null>(null);

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
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b border-[#34544F]">
        <div>
          <div className="flex items-center space-x-2">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ background: 'var(--tw-hero-line)' }}
            />
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-sans">
              Multi-account desk
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-[#CFE2DE] mt-1 font-sans">
            Independent account segregation, prop-firm rules and risk limits for each desk.
          </p>
        </div>

        <button
          onClick={() => setNewAccountModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-full bg-white text-[#0B1415] hover:bg-gray-100 font-sans font-semibold text-xs sm:text-sm transition-all shadow-md self-start sm:self-auto cursor-pointer"
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
              <span>{formatCurrency(portfolioSummary.totalEquity).split('.')[0]}</span>
              <span className="text-2xl sm:text-3xl font-medium ml-1" style={{ color: 'var(--tw-hero-2)' }}>
                .{formatCurrency(portfolioSummary.totalEquity).split('.')[1]}
              </span>
            </div>

            <div className="mt-3 flex items-center gap-2 text-xs sm:text-sm">
              <span
                className="inline-flex items-center px-3 py-1 rounded-full text-xs font-mono font-bold"
                style={{ background: 'var(--tw-hero-chip)', color: 'var(--tw-hero-ink)' }}
              >
                {portfolioSummary.netGain >= 0 ? '+' : ''}{formatCurrency(portfolioSummary.netGain)} ({portfolioSummary.gainPct >= 0 ? '+' : ''}{portfolioSummary.gainPct.toFixed(1)}%)
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
            {formatCurrency(portfolioMetrics.openRiskUsd || 600)}
          </div>

          <div className="text-xs font-sans font-medium" style={{ color: 'var(--tw-sun-ink)' }}>
            {portfolioSummary.totalEquity > 0
              ? `${((portfolioMetrics.openRiskUsd || 600) / portfolioSummary.totalEquity * 100).toFixed(2)}% of balance`
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

        {/* SUMMARY TILE 4: ACTIVE DESKS (Cols 11-12) — Dark Tile */}
        <section
          aria-label="Active desks"
          className="bento-tile md:col-span-2 lg:col-span-2 justify-between"
          style={{ minHeight: '220px' }}
        >
          <div className="text-xs font-bold uppercase tracking-wide text-[#CFE2DE]">
            Active desks
          </div>

          <div className="text-4xl font-mono font-bold tracking-tight text-white">
            {accounts.length}
          </div>

          <div className="text-xs font-sans text-[#A9C1BD]">
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
              className={`rounded-[32px] p-6 border transition-all flex flex-col justify-between space-y-5 bg-[#0B1415] ${
                isSelected
                  ? 'border-[#9BF3DF] shadow-glow'
                  : 'border-[#34544F] hover:border-[#4F7470]'
              }`}
            >
              {/* Account Card Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <h2 className="text-lg sm:text-xl font-bold font-sans tracking-tight text-white">
                    {acc.name}
                  </h2>
                  <p className="text-xs text-[#A9C1BD] font-sans">
                    {acc.brokerOrFirm}, {acc.challengePhase}
                  </p>
                </div>

                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    isFunded
                      ? 'bg-[#FFD56B] text-[#0A0800]'
                      : isEval
                      ? 'bg-[rgba(255,184,107,0.15)] text-[#FFB86B] border border-[rgba(255,184,107,0.6)]'
                      : 'bg-[#13211F] text-[#CFE2DE] border border-[#34544F]'
                  }`}
                >
                  {isFunded ? 'Funded' : isEval ? 'Prop evaluation' : 'Personal'}
                </span>
              </div>

              {/* Equity & Return Metrics Row */}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-[#34544F] font-mono">
                <div>
                  <div className="text-xs text-[#CFE2DE]">Equity</div>
                  <div className="text-xl sm:text-2xl font-bold text-white mt-1 tabular-nums">
                    {formatCurrency(acc.currentEquity)}
                  </div>
                  <small className="text-[11px] text-[#A9C1BD] block mt-1">
                    Start {formatCurrency(acc.startingBalance)}
                  </small>
                </div>

                <div className="text-right">
                  <div className="text-xs text-[#CFE2DE]">Net gain</div>
                  <div className={`text-base sm:text-lg font-bold mt-1 tabular-nums ${netProfit >= 0 ? 'text-[#5BE6AE]' : 'text-[#FF8F80]'}`}>
                    {netProfit >= 0 ? '+' : ''}{formatCurrency(netProfit)} ({returnPct >= 0 ? '+' : ''}{returnPct.toFixed(1)}%)
                  </div>
                  <small className="text-[11px] text-[#A9C1BD] block mt-1">
                    Drawdown {currentDdPct.toFixed(1)}%, {formatCurrency(currentDd)}
                  </small>
                </div>
              </div>

              {/* Mini Metrics Strip (Trades, Win Rate, Peak Eq) */}
              <dl className="grid grid-cols-3 rounded-2xl bg-[#13211F] py-3 text-center font-mono border border-[#34544F]">
                <div>
                  <dt className="text-[11px] text-[#A9C1BD]">Trades</dt>
                  <dd className="text-sm sm:text-base font-bold text-white mt-1">{closedTrades.length}</dd>
                </div>
                <div className="border-x border-[#34544F]">
                  <dt className="text-[11px] text-[#A9C1BD]">Win rate</dt>
                  <dd className="text-sm sm:text-base font-bold text-white mt-1">{winRate.toFixed(1)}%</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-[#A9C1BD]">Peak equity</dt>
                  <dd className="text-sm sm:text-base font-bold text-white mt-1">
                    ${(acc.highWaterMark / 1000).toFixed(1)}k
                  </dd>
                </div>
              </dl>

              {/* Active Rule Limits List */}
              <div className="space-y-2 pt-1 font-mono text-xs">
                <div className="flex justify-between items-center text-[#CFE2DE] text-[11px] font-semibold pb-1">
                  <span>Active rule limits ({acc.rules.length})</span>
                  <span>Status</span>
                </div>

                <div className="space-y-1.5 divide-y divide-[#34544F]/60">
                  {acc.rules.slice(0, 3).map((r) => (
                    <div key={r.id} className="pt-2 flex justify-between items-center text-[#CFE2DE]">
                      <span className="truncate pr-2">{r.ruleType.replace(/_/g, ' ')}</span>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          r.currentStatus === 'SAFE'
                            ? 'bg-[#8FEBD3] text-[#03211C]'
                            : r.currentStatus === 'WARNING'
                            ? 'bg-[rgba(255,184,107,0.15)] text-[#FFB86B] border border-[rgba(255,184,107,0.6)]'
                            : r.currentStatus === 'BREACHED'
                            ? 'bg-[rgba(255,143,128,0.2)] text-[#FF8F80] border border-[rgba(255,143,128,0.6)]'
                            : 'bg-[#13211F] text-[#CFE2DE]'
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
                      ? 'bg-[#9BF3DF] text-[#03211C] shadow-glow font-bold'
                      : 'bg-[#13211F] text-[#CFE2DE] hover:text-white hover:bg-[#1A2D2B] border border-[#34544F]'
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

                <button
                  onClick={() => setEditingRuleAccount(acc)}
                  className="w-10 h-10 rounded-full flex items-center justify-center bg-[#13211F] border border-[#34544F] text-[#CFE2DE] hover:text-white hover:border-[#9BF3DF] transition-all cursor-pointer"
                  title="Configure Rules"
                  aria-label="Configure rules"
                >
                  <Settings size={15} />
                </button>

                <button
                  onClick={() => deleteAccount(acc.id)}
                  className="w-10 h-10 rounded-full flex items-center justify-center bg-[#13211F] border border-[#34544F] text-[#A9C1BD] hover:text-[#FF8F80] hover:border-[#FF8F80] transition-all cursor-pointer"
                  title="Archive Account"
                  aria-label={`Remove ${acc.name}`}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* 4. Rule Engine Configuration Modal */}
      {editingRuleAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-3xl border border-[#34544F] bg-[#0B1415] shadow-2xl text-xs p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#34544F]">
              <div className="flex items-center space-x-2">
                <ShieldCheck size={18} className="text-[#9BF3DF]" />
                <h2 className="font-mono text-sm font-bold tracking-wider text-white uppercase">
                  RULE ENGINE SURVEILLANCE: {editingRuleAccount.name}
                </h2>
              </div>
              <button
                onClick={() => setEditingRuleAccount(null)}
                className="w-8 h-8 rounded-full bg-[#13211F] border border-[#34544F] text-[#CFE2DE] hover:text-white flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <p className="text-[#A9C1BD] font-sans text-xs leading-relaxed">
              Autonomous risk monitoring rules enforce prop-firm constraints and drawdown thresholds in real time with 4-state evaluation (Safe, Warning, Breached, Unknown).
            </p>

            <div className="space-y-3 font-mono">
              {editingRuleAccount.rules.map((rule) => (
                <div
                  key={rule.id}
                  className="p-3.5 rounded-2xl border border-[#34544F] bg-[#13211F] space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2.5">
                      <input
                        type="checkbox"
                        checked={rule.isEnabled}
                        onChange={() => toggleRule(editingRuleAccount.id, rule.id)}
                        className="rounded border-[#34544F] text-[#9BF3DF] focus:ring-0 cursor-pointer"
                      />
                      <span className="font-bold text-white uppercase text-xs">
                        {rule.ruleType.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        rule.currentStatus === 'SAFE'
                          ? 'bg-[#8FEBD3] text-[#03211C]'
                          : rule.currentStatus === 'WARNING'
                          ? 'bg-[rgba(255,184,107,0.15)] text-[#FFB86B]'
                          : rule.currentStatus === 'BREACHED'
                          ? 'bg-[rgba(255,143,128,0.2)] text-[#FF8F80]'
                          : 'bg-[#0B1415] text-[#CFE2DE]'
                      }`}
                    >
                      {rule.currentStatus}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-[11px] text-[#A9C1BD] pt-1 border-t border-[#34544F]/50">
                    <div>
                      <span className="block text-[9px] uppercase font-bold text-[#CFE2DE]">Limit Threshold</span>
                      <span className="font-semibold text-white">
                        {rule.thresholdUnit === 'percent'
                          ? `${rule.thresholdValue}%`
                          : formatCurrency(rule.thresholdValue)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[9px] uppercase font-bold text-[#CFE2DE]">Calculation Method</span>
                      <span className="font-semibold text-white">{rule.calculationMethod}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] uppercase font-bold text-[#CFE2DE]">Warning Buffer</span>
                      <span className="font-semibold text-[#FFB86B]">{rule.warningThresholdPct}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setEditingRuleAccount(null)}
                className="px-5 py-2.5 rounded-full bg-white text-[#0B1415] font-sans font-bold hover:bg-gray-100 transition-colors shadow-sm"
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
