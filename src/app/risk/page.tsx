'use client';

import React, { useState } from 'react';
import { useTrading } from '../../context/TradingContext';
import {
  ShieldAlert,
  ShieldCheck,
  Calculator,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  TrendingDown,
  Percent,
  DollarSign
} from 'lucide-react';
import { calculatePositionSize } from '../../lib/calculations/financialEngine';

export default function RiskTerminalPage() {
  const {
    accounts,
    selectedAccountId,
    selectedAccount,
    instruments,
    portfolioMetrics,
    trades
  } = useTrading();

  const targetAccount = selectedAccount || accounts[0];

  // Calculator inputs
  const [calcSymbol, setCalcSymbol] = useState('XAUUSD');
  const [calcRiskPct, setCalcRiskPct] = useState('1.0');
  const [calcEntry, setCalcEntry] = useState('2710.00');
  const [calcSl, setCalcSl] = useState('2702.00');
  const [calcTp, setCalcTp] = useState('2726.00');

  const selectedInst = instruments.find((i) => i.symbol === calcSymbol) || instruments[0];

  // Position calculation
  const numEntry = parseFloat(calcEntry) || 0;
  const numSl = parseFloat(calcSl) || 0;
  const numTp = parseFloat(calcTp) || 0;
  const numRiskPct = parseFloat(calcRiskPct) || 1.0;

  let calcResult = null;
  let calcError = null;

  try {
    if (numEntry > 0 && numSl > 0 && numEntry !== numSl) {
      calcResult = calculatePositionSize({
        accountEquity: targetAccount.currentEquity,
        riskPercentage: numRiskPct,
        entryPrice: numEntry,
        stopLossPrice: numSl,
        takeProfitPrice: numTp > 0 ? numTp : undefined,
        instrument: selectedInst,
      });
    }
  } catch (e: any) {
    calcError = e.message;
  }

  // Pre-trade checklist state
  const [checklist, setChecklist] = useState({
    c1: false,
    c2: false,
    c3: false,
    c4: false,
    c5: false,
    c6: false,
    c7: false,
    c8: false,
  });

  const allPassed = Object.values(checklist).every(Boolean);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(val);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-edge-border">
        <div>
          <div className="flex items-center space-x-2">
            <ShieldAlert size={20} className="text-edge-accent" />
            <h1 className="text-xl font-mono font-bold tracking-tight text-white uppercase">
              INSTITUTIONAL RISK TERMINAL
            </h1>
          </div>
          <p className="text-xs text-edge-text-secondary mt-0.5">
            Active drawdown surveillance, precision position sizing, and pre-execution compliance gates.
          </p>
        </div>

        <div className="flex items-center space-x-2 font-mono text-xs">
          <span className="text-edge-text-muted">Target Account:</span>
          <span className="font-bold text-white px-2 py-1 rounded bg-edge-surface-secondary border border-edge-border">
            {targetAccount.name}
          </span>
        </div>
      </div>

      {/* Risk Metrics Surveillance Panel */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Daily Loss Allowance */}
        <div className="p-4 rounded-lg border border-edge-border bg-edge-surface space-y-1 font-mono">
          <span className="text-[10px] text-edge-text-muted uppercase">Daily Loss Buffer</span>
          <div className="text-lg font-bold text-white tabular-nums">
            {formatCurrency(Math.max(0, targetAccount.accountSize * 0.05 - Math.max(0, -portfolioMetrics.todayPnl)))}
          </div>
          <span className="text-[10px] text-edge-profit font-semibold">
            5.0% Limit (${formatCurrency(targetAccount.accountSize * 0.05)})
          </span>
        </div>

        {/* Overall Drawdown Allowance */}
        <div className="p-4 rounded-lg border border-edge-border bg-edge-surface space-y-1 font-mono">
          <span className="text-[10px] text-edge-text-muted uppercase">Overall Drawdown Buffer</span>
          <div className="text-lg font-bold text-white tabular-nums">
            {formatCurrency(Math.max(0, targetAccount.highWaterMark - targetAccount.currentEquity))}
          </div>
          <span className="text-[10px] text-edge-accent font-semibold">
            Trailing Peak: {formatCurrency(targetAccount.highWaterMark)}
          </span>
        </div>

        {/* Total Open Risk */}
        <div className="p-4 rounded-lg border border-edge-border bg-edge-surface space-y-1 font-mono">
          <span className="text-[10px] text-edge-text-muted uppercase">Total Open Risk</span>
          <div
            className={`text-lg font-bold tabular-nums ${
              portfolioMetrics.openRiskUsd > 0 ? 'text-edge-warning' : 'text-white'
            }`}
          >
            {formatCurrency(portfolioMetrics.openRiskUsd)}
          </div>
          <span className="text-[10px] text-edge-text-muted">
            {portfolioMetrics.totalEquity > 0
              ? `${((portfolioMetrics.openRiskUsd / portfolioMetrics.totalEquity) * 100).toFixed(2)}% of equity`
              : '0%'}
          </span>
        </div>

        {/* Consecutive Losses */}
        <div className="p-4 rounded-lg border border-edge-border bg-edge-surface space-y-1 font-mono">
          <span className="text-[10px] text-edge-text-muted uppercase">Max Consec. Losses</span>
          <div className="text-lg font-bold text-white tabular-nums">
            {portfolioMetrics.maxConsecutiveLosses} Trades
          </div>
          <span className="text-[10px] text-edge-profit">
            Consec. Wins: {portfolioMetrics.maxConsecutiveWins}
          </span>
        </div>
      </div>

      {/* Main Terminal Workspace: Calculator & Pre-Trade Checklist */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Position Sizing Calculator */}
        <div className="p-5 rounded-lg border border-edge-border bg-edge-surface space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-edge-border">
            <div className="flex items-center space-x-2">
              <Calculator size={18} className="text-edge-accent" />
              <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-white">
                PRECISION POSITION SIZING CALCULATOR
              </h2>
            </div>
            <span className="text-[10px] font-mono text-edge-accent">
              {selectedInst.category.toUpperCase()} • SPEC READY
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            <div>
              <label className="block text-edge-text-muted text-[10px] uppercase mb-1">
                Instrument
              </label>
              <select
                value={calcSymbol}
                onChange={(e) => setCalcSymbol(e.target.value)}
                className="w-full px-3 py-2 rounded bg-edge-surface-secondary border border-edge-border text-white outline-none focus:border-edge-accent"
              >
                {instruments.map((i) => (
                  <option key={i.symbol} value={i.symbol}>
                    {i.symbol} ({i.name})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-edge-text-muted text-[10px] uppercase mb-1">
                Risk % of Equity
              </label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                max="5.0"
                value={calcRiskPct}
                onChange={(e) => setCalcRiskPct(e.target.value)}
                className="w-full px-3 py-2 rounded bg-edge-surface-secondary border border-edge-border text-edge-accent font-bold outline-none focus:border-edge-accent tabular-nums"
              />
            </div>

            <div>
              <label className="block text-edge-text-muted text-[10px] uppercase mb-1">
                Entry Price
              </label>
              <input
                type="number"
                step="any"
                value={calcEntry}
                onChange={(e) => setCalcEntry(e.target.value)}
                className="w-full px-3 py-2 rounded bg-edge-surface-secondary border border-edge-border text-white outline-none focus:border-edge-accent tabular-nums"
              />
            </div>

            <div>
              <label className="block text-edge-loss text-[10px] uppercase mb-1">
                Stop Loss Price
              </label>
              <input
                type="number"
                step="any"
                value={calcSl}
                onChange={(e) => setCalcSl(e.target.value)}
                className="w-full px-3 py-2 rounded bg-edge-surface-secondary border border-edge-loss/40 text-edge-loss outline-none focus:border-edge-loss tabular-nums"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-edge-profit text-[10px] uppercase mb-1">
                Take Profit Price (Optional)
              </label>
              <input
                type="number"
                step="any"
                value={calcTp}
                onChange={(e) => setCalcTp(e.target.value)}
                className="w-full px-3 py-2 rounded bg-edge-surface-secondary border border-edge-profit/40 text-edge-profit outline-none focus:border-edge-profit tabular-nums"
              />
            </div>
          </div>

          {/* Output Card */}
          {calcResult && (
            <div className="p-4 rounded-lg border border-edge-accent/40 bg-edge-accent/10 space-y-3 font-mono">
              <div className="flex justify-between items-center text-xs text-edge-accent font-bold uppercase tracking-wider">
                <span>Calculated Allocation</span>
                <span>{selectedInst.symbol}</span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-[10px] text-edge-text-muted uppercase block">Lot / Contract Size</span>
                  <span className="text-xl font-bold text-white tabular-nums">
                    {calcResult.positionSize} Lots
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-edge-text-muted uppercase block">Monetary Risk</span>
                  <span className="text-xl font-bold text-edge-loss tabular-nums">
                    -${calcResult.potentialLoss.toLocaleString()}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-edge-text-muted uppercase block">Potential Gain</span>
                  <span className="text-base font-bold text-edge-profit tabular-nums">
                    +${(calcResult.potentialProfit || 0).toLocaleString()}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-edge-text-muted uppercase block">Risk:Reward</span>
                  <span className="text-base font-bold text-edge-accent tabular-nums">
                    1:{calcResult.plannedRr || 0}
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-edge-accent/20 flex justify-between text-[10px] text-edge-text-secondary">
                <span>Contract Size: {selectedInst.contractSize}</span>
                <span>Tick Risk: {calcResult.tickRisk} ticks</span>
              </div>
            </div>
          )}

          {calcError && (
            <div className="p-3 rounded bg-edge-loss/15 border border-edge-loss/40 text-edge-loss flex items-center space-x-2 font-mono text-xs">
              <AlertCircle size={16} />
              <span>{calcError}</span>
            </div>
          )}
        </div>

        {/* Right: Pre-Trade Discipline Checklist */}
        <div className="p-5 rounded-lg border border-edge-border bg-edge-surface space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-edge-border">
            <div className="flex items-center space-x-2">
              <CheckCircle2 size={18} className="text-edge-profit" />
              <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-white">
                PRE-TRADE DISCIPLINE & COMPLIANCE GATE
              </h2>
            </div>
            <span
              className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                allPassed
                  ? 'bg-edge-profit/20 text-edge-profit border border-edge-profit/40'
                  : 'bg-edge-loss/20 text-edge-loss border border-edge-loss/40'
              }`}
            >
              {allPassed ? 'ALL GATES CLEARED' : 'COMPLIANCE PENDING'}
            </span>
          </div>

          <p className="text-xs text-edge-text-secondary font-sans leading-relaxed">
            Verify every psychological and quantitative checkpoint before executing the order.
          </p>

          <div className="space-y-2.5 font-mono text-xs">
            {[
              { id: 'c1', text: 'Does this setup cleanly match a documented Strategy in the library?' },
              { id: 'c2', text: 'Is the Higher Timeframe (4H / Daily) narrative and bias confirmed?' },
              { id: 'c3', text: 'Is there a valid liquidity sweep or price-action trigger?' },
              { id: 'c4', text: 'Is the stop loss placed at a structural invalidation point?' },
              { id: 'c5', text: 'Does the reward-to-risk ratio offer at least 1:2 or better?' },
              { id: 'c6', text: 'Is monetary risk within account daily limit allowance?' },
              { id: 'c7', text: 'Are there zero high-impact CPI/FOMC releases in next 30 mins?' },
              { id: 'c8', text: 'Entering calmly with zero FOMO, revenge, or emotional impatience?' },
            ].map((item) => {
              const checked = (checklist as any)[item.id];
              return (
                <label
                  key={item.id}
                  className={`flex items-start space-x-3 p-2.5 rounded border cursor-pointer transition-colors ${
                    checked
                      ? 'bg-edge-profit/10 border-edge-profit/40 text-white'
                      : 'bg-edge-surface-secondary/40 border-edge-border text-edge-text-secondary hover:text-white'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) =>
                      setChecklist({ ...checklist, [item.id]: e.target.checked })
                    }
                    className="mt-0.5 rounded border-edge-border text-edge-accent focus:ring-0"
                  />
                  <span className="text-[11px] leading-tight">{item.text}</span>
                </label>
              );
            })}
          </div>

          <div className="p-3 rounded border border-edge-border bg-edge-surface-secondary/20 flex justify-between items-center text-[11px] font-mono">
            <span className="text-edge-text-muted">
              Checklist Status: {Object.values(checklist).filter(Boolean).length}/8 Verified
            </span>
            <button
              onClick={() =>
                setChecklist({
                  c1: true,
                  c2: true,
                  c3: true,
                  c4: true,
                  c5: true,
                  c6: true,
                  c7: true,
                  c8: true,
                })
              }
              className="text-edge-accent hover:underline text-[10px]"
            >
              Verify All
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
