'use client';

import React, { useState } from 'react';
import { useTrading } from '../../context/TradingContext';
import {
  Wallet,
  ShieldCheck,
  ShieldAlert,
  Plus,
  ArrowUpRight,
  TrendingUp,
  Percent,
  CheckCircle,
  AlertTriangle,
  Settings,
  Trash2,
  Edit2
} from 'lucide-react';
import { NewAccountModal } from '../../components/modals/NewAccountModal';
import { TradingAccount, AccountRule } from '../../lib/types/financial';

export default function AccountsPage() {
  const {
    accounts,
    selectedAccountId,
    setSelectedAccountId,
    trades,
    updateAccount,
    deleteAccount,
    updateRule,
    addRule,
    toggleRule
  } = useTrading();

  const [newAccountModalOpen, setNewAccountModalOpen] = useState(false);
  const [editingRuleAccount, setEditingRuleAccount] = useState<TradingAccount | null>(null);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(val);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-edge-border">
        <div>
          <div className="flex items-center space-x-2">
            <Wallet size={20} className="text-edge-accent" />
            <h1 className="text-xl font-mono font-bold tracking-tight text-white uppercase">
              MULTI-ACCOUNT DESK MANAGEMENT
            </h1>
          </div>
          <p className="text-xs text-edge-text-secondary mt-0.5">
            Independent account segregation, prop-firm rulesets, and risk parameter monitoring.
          </p>
        </div>

        <button
          onClick={() => setNewAccountModalOpen(true)}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-edge-accent text-edge-bg hover:bg-edge-accent-light font-mono text-xs font-semibold tracking-wide transition-colors self-start sm:self-auto"
        >
          <Plus size={14} />
          <span>PROVISION ACCOUNT</span>
        </button>
      </div>

      {/* Account Comparison Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
          const returnPct = (netProfit / acc.startingBalance) * 100;
          const currentDd = Math.max(0, acc.highWaterMark - acc.currentEquity);
          const currentDdPct = acc.highWaterMark > 0 ? (currentDd / acc.highWaterMark) * 100 : 0;

          // Check rules status
          const hasBreach = acc.rules.some((r) => r.currentStatus === 'BREACHED');
          const hasWarning = acc.rules.some((r) => r.currentStatus === 'WARNING');

          const isSelected = selectedAccountId === acc.id;

          return (
            <div
              key={acc.id}
              className={`rounded-lg border p-4 transition-all flex flex-col justify-between space-y-4 ${
                isSelected
                  ? 'border-edge-accent/80 bg-edge-surface shadow-glow'
                  : 'border-edge-border bg-edge-surface/80 hover:border-edge-border-strong'
              }`}
            >
              {/* Card Header */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="font-mono font-bold text-sm text-white">{acc.name}</h3>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase font-semibold bg-edge-surface-secondary text-edge-accent border border-edge-accent/30">
                      {acc.accountType.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-[11px] font-mono text-edge-text-muted mt-0.5">
                    {acc.brokerOrFirm} • {acc.challengePhase}
                  </p>
                </div>

                <div className="flex items-center space-x-1">
                  {hasBreach ? (
                    <span className="p-1 rounded bg-edge-loss/20 text-edge-loss" title="Rule Breached">
                      <AlertTriangle size={15} />
                    </span>
                  ) : hasWarning ? (
                    <span className="p-1 rounded bg-edge-warning/20 text-edge-warning" title="Rule Warning Threshold">
                      <AlertTriangle size={15} />
                    </span>
                  ) : (
                    <span className="p-1 rounded bg-edge-profit/20 text-edge-profit" title="All Rules Safe">
                      <ShieldCheck size={15} />
                    </span>
                  )}

                  <button
                    onClick={() => setEditingRuleAccount(acc)}
                    className="p-1 rounded text-edge-text-muted hover:text-white hover:bg-edge-surface-secondary"
                    title="Configure Rules"
                  >
                    <Settings size={15} />
                  </button>
                </div>
              </div>

              {/* Balances & Return */}
              <div className="grid grid-cols-2 gap-3 py-2 border-y border-edge-border/50 font-mono text-xs">
                <div>
                  <span className="text-[10px] text-edge-text-muted uppercase">Equity</span>
                  <div className="text-base font-bold text-white tabular-nums">
                    {formatCurrency(acc.currentEquity)}
                  </div>
                  <span className="text-[9px] text-edge-text-muted">
                    Start: {formatCurrency(acc.startingBalance)}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-edge-text-muted uppercase">Net Gain / Loss</span>
                  <div
                    className={`text-base font-bold tabular-nums ${
                      netProfit >= 0 ? 'text-edge-profit' : 'text-edge-loss'
                    }`}
                  >
                    {netProfit >= 0 ? '+' : ''}
                    {formatCurrency(netProfit)} ({returnPct.toFixed(1)}%)
                  </div>
                  <span className="text-[9px] text-edge-text-muted">
                    DD: {currentDdPct.toFixed(1)}% ({formatCurrency(currentDd)})
                  </span>
                </div>
              </div>

              {/* Metrics Grid: Win Rate & Trades */}
              <div className="grid grid-cols-3 gap-2 font-mono text-[11px] text-center bg-edge-surface-secondary/40 p-2 rounded">
                <div>
                  <span className="text-[9px] text-edge-text-muted uppercase block">Trades</span>
                  <span className="font-bold text-white">{closedTrades.length}</span>
                </div>
                <div>
                  <span className="text-[9px] text-edge-text-muted uppercase block">Win Rate</span>
                  <span className="font-bold text-white">{winRate.toFixed(1)}%</span>
                </div>
                <div>
                  <span className="text-[9px] text-edge-text-muted uppercase block">Peak Eq</span>
                  <span className="font-bold text-white">${(acc.highWaterMark / 1000).toFixed(1)}k</span>
                </div>
              </div>

              {/* Rules Compliance Quick Pill */}
              <div className="space-y-1.5 font-mono text-[10px]">
                <div className="text-edge-text-muted uppercase tracking-wider font-semibold flex justify-between">
                  <span>Active Rule Limits ({acc.rules.length})</span>
                  <span>Status</span>
                </div>
                {acc.rules.slice(0, 3).map((r) => (
                  <div key={r.id} className="flex justify-between items-center text-edge-text-secondary">
                    <span>{r.ruleType.replace(/_/g, ' ')}</span>
                    <span
                      className={`px-1 rounded text-[9px] font-bold ${
                        r.currentStatus === 'BREACHED'
                          ? 'bg-edge-loss/20 text-edge-loss'
                          : r.currentStatus === 'WARNING'
                          ? 'bg-edge-warning/20 text-edge-warning'
                          : 'bg-edge-profit/20 text-edge-profit'
                      }`}
                    >
                      {r.currentStatus}
                    </span>
                  </div>
                ))}
              </div>

              {/* Select Account Button */}
              <div className="flex items-center space-x-2 pt-2">
                <button
                  onClick={() => setSelectedAccountId(isSelected ? 'ALL' : acc.id)}
                  className={`flex-1 py-1.5 rounded font-mono text-xs font-semibold tracking-wider transition-colors border ${
                    isSelected
                      ? 'bg-edge-accent text-edge-bg border-edge-accent'
                      : 'bg-edge-surface-secondary text-edge-text-secondary hover:text-white border-edge-border'
                  }`}
                >
                  {isSelected ? 'CURRENT FOCUS' : 'SELECT DESK'}
                </button>

                <button
                  onClick={() => deleteAccount(acc.id)}
                  className="p-1.5 rounded text-edge-text-muted hover:text-edge-loss hover:bg-edge-surface-secondary transition-colors"
                  title="Archive Account"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Rule Engine Modal Editor */}
      {editingRuleAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-lg border border-edge-border bg-edge-surface shadow-terminal text-xs">
            <div className="flex items-center justify-between p-4 border-b border-edge-border bg-edge-surface-secondary/50">
              <div className="flex items-center space-x-2">
                <ShieldCheck size={16} className="text-edge-accent" />
                <h2 className="font-mono text-xs font-bold tracking-wider text-white uppercase">
                  RULE ENGINE CONFIGURATION: {editingRuleAccount.name}
                </h2>
              </div>
              <button
                onClick={() => setEditingRuleAccount(null)}
                className="text-edge-text-secondary hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-4">
              <p className="text-edge-text-secondary font-sans text-xs">
                Configure autonomous risk monitoring rules. Rules calculate continuously whenever executions or account snapshots update.
              </p>

              <div className="space-y-3 font-mono">
                {editingRuleAccount.rules.map((rule) => (
                  <div
                    key={rule.id}
                    className="p-3 rounded border border-edge-border bg-edge-surface-secondary/40 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={rule.isEnabled}
                          onChange={() => toggleRule(editingRuleAccount.id, rule.id)}
                          className="rounded border-edge-border text-edge-accent"
                        />
                        <span className="font-bold text-white uppercase">{rule.ruleType.replace(/_/g, ' ')}</span>
                      </div>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          rule.currentStatus === 'BREACHED'
                            ? 'bg-edge-loss/20 text-edge-loss'
                            : rule.currentStatus === 'WARNING'
                            ? 'bg-edge-warning/20 text-edge-warning'
                            : 'bg-edge-profit/20 text-edge-profit'
                        }`}
                      >
                        {rule.currentStatus}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-[11px] text-edge-text-muted">
                      <div>
                        <span className="block text-[9px] uppercase">Limit Threshold</span>
                        <span className="font-semibold text-white">
                          {rule.thresholdUnit === 'percent'
                            ? `${rule.thresholdValue}%`
                            : formatCurrency(rule.thresholdValue)}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[9px] uppercase">Calculation Method</span>
                        <span className="font-semibold text-white">{rule.calculationMethod}</span>
                      </div>
                      <div>
                        <span className="block text-[9px] uppercase">Warning Buffer</span>
                        <span className="font-semibold text-edge-warning">{rule.warningThresholdPct}%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => setEditingRuleAccount(null)}
                  className="px-4 py-2 rounded bg-edge-accent text-edge-bg font-mono font-bold tracking-wider hover:bg-edge-accent-light"
                >
                  SAVE CONFIGURATION
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <NewAccountModal
        isOpen={newAccountModalOpen}
        onClose={() => setNewAccountModalOpen(false)}
      />
    </div>
  );
}
