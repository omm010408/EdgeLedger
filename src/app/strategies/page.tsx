'use client';

import React, { useState } from 'react';
import { useTrading } from '../../context/TradingContext';
import {
  TrendingUp,
  Plus,
  CheckCircle2,
  ListOrdered,
  Layers,
  Edit2,
  Trash2,
  CheckSquare,
  Shield,
  ArrowRight
} from 'lucide-react';
import { Strategy } from '../../lib/data/seedData';

export default function StrategiesPage() {
  const { strategies, trades, addStrategy, updateStrategy, deleteStrategy } = useTrading();

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [marketType, setMarketType] = useState('Forex & Metals');
  const [marketRegime, setMarketRegime] = useState<'trending' | 'ranging' | 'breakout' | 'reversal'>('trending');
  const [entryConditions, setEntryConditions] = useState('');
  const [exitConditions, setExitConditions] = useState('');
  const [stopLossMethodology, setStopLossMethodology] = useState('');
  const [targetMethodology, setTargetMethodology] = useState('');
  const [riskRules, setRiskRules] = useState('');

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(val);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    addStrategy({
      name,
      description,
      marketType,
      marketRegime,
      entryConditions,
      exitConditions,
      stopLossMethodology,
      targetMethodology,
      riskRules,
      checklistItems: ['Bias aligned', 'Trigger confirmed', 'Risk limit checked'],
    });

    setModalOpen(false);
    resetForm();
  };

  const resetForm = () => {
    setName('');
    setDescription('');
    setMarketType('Forex & Metals');
    setMarketRegime('trending');
    setEntryConditions('');
    setExitConditions('');
    setStopLossMethodology('');
    setTargetMethodology('');
    setRiskRules('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-edge-border">
        <div>
          <div className="flex items-center space-x-2">
            <TrendingUp size={20} className="text-edge-accent" />
            <h1 className="text-xl font-mono font-bold tracking-tight text-white uppercase">
              STRATEGY PLAYBOOK & QUANTITATIVE AUDIT
            </h1>
          </div>
          <p className="text-xs text-edge-text-secondary mt-0.5">
            Systematic setup rules, execution checklists, and live performance attribution.
          </p>
        </div>

        <button
          onClick={() => {
            resetForm();
            setModalOpen(true);
          }}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-edge-accent text-edge-bg hover:bg-edge-accent-light font-mono text-xs font-semibold tracking-wide transition-colors self-start sm:self-auto"
        >
          <Plus size={14} />
          <span>NEW STRATEGY</span>
        </button>
      </div>

      {/* Strategies Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {strategies.map((strat) => {
          const stratTrades = trades.filter((t) => t.strategyId === strat.id && t.status === 'CLOSED');
          const wins = stratTrades.filter((t) => t.netPnl > 0).length;
          const totalPnl = stratTrades.reduce((sum, t) => sum + t.netPnl, 0);
          const totalR = stratTrades.reduce((sum, t) => sum + (t.realizedR || 0), 0);
          const winRate = stratTrades.length > 0 ? (wins / stratTrades.length) * 100 : 0;
          const avgR = stratTrades.length > 0 ? (totalR / stratTrades.length) : 0;

          return (
            <div
              key={strat.id}
              className="rounded-lg border border-edge-border bg-edge-surface p-4 flex flex-col justify-between space-y-4 hover:border-edge-border-strong transition-all shadow-subtle"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-edge-accent/15 text-edge-accent border border-edge-accent/30">
                      {strat.marketRegime}
                    </span>
                    <h3 className="font-mono text-sm font-bold text-white mt-1.5">{strat.name}</h3>
                  </div>

                  <button
                    onClick={() => deleteStrategy(strat.id)}
                    className="text-edge-text-muted hover:text-edge-loss p-1 rounded transition-colors"
                    title="Delete Strategy"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <p className="text-xs text-edge-text-secondary mt-2 font-sans line-clamp-2">
                  {strat.description}
                </p>
              </div>

              {/* Performance Stats */}
              <div className="grid grid-cols-3 gap-2 p-2.5 rounded bg-edge-surface-secondary/50 font-mono text-center text-xs">
                <div>
                  <span className="text-[9px] text-edge-text-muted uppercase block">Trades</span>
                  <span className="font-bold text-white">{stratTrades.length}</span>
                </div>
                <div>
                  <span className="text-[9px] text-edge-text-muted uppercase block">Win Rate</span>
                  <span className="font-bold text-white">{winRate.toFixed(1)}%</span>
                </div>
                <div>
                  <span className="text-[9px] text-edge-text-muted uppercase block">Total Net</span>
                  <span
                    className={`font-bold tabular-nums ${
                      totalPnl >= 0 ? 'text-edge-profit' : 'text-edge-loss'
                    }`}
                  >
                    {totalPnl >= 0 ? '+' : ''}
                    {formatCurrency(totalPnl)}
                  </span>
                </div>
              </div>

              {/* Checklist items */}
              <div className="space-y-1.5 font-mono text-[11px]">
                <span className="text-[10px] text-edge-text-muted uppercase tracking-wider font-semibold block">
                  Core Criteria Checklist:
                </span>
                {strat.checklistItems.slice(0, 3).map((item, idx) => (
                  <div key={idx} className="flex items-center space-x-1.5 text-edge-text-secondary">
                    <CheckCircle2 size={12} className="text-edge-accent shrink-0" />
                    <span className="truncate">{item}</span>
                  </div>
                ))}
              </div>

              {/* Detail view trigger */}
              <button
                onClick={() => setSelectedStrategy(strat)}
                className="w-full py-1.5 rounded bg-edge-surface-secondary border border-edge-border text-edge-text-secondary hover:text-white font-mono text-xs font-semibold flex items-center justify-center space-x-1 transition-colors"
              >
                <span>VIEW PLAYBOOK RULES</span>
                <ArrowRight size={13} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Strategy Detail View Modal */}
      {selectedStrategy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-lg border border-edge-border bg-edge-surface shadow-terminal p-5 space-y-4 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-edge-border pb-3">
              <div>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-edge-accent/15 text-edge-accent">
                  {selectedStrategy.marketType} • {selectedStrategy.marketRegime}
                </span>
                <h2 className="text-base font-bold text-white uppercase mt-1">{selectedStrategy.name}</h2>
              </div>
              <button
                onClick={() => setSelectedStrategy(null)}
                className="text-edge-text-secondary hover:text-white"
              >
                ✕
              </button>
            </div>

            <p className="font-sans text-edge-text-secondary text-xs leading-relaxed">
              {selectedStrategy.description}
            </p>

            <div className="space-y-3">
              <div className="p-3 rounded border border-edge-border bg-edge-surface-secondary/30 space-y-1">
                <span className="text-[10px] text-edge-accent uppercase font-bold tracking-wider">
                  Entry Trigger Protocol
                </span>
                <p className="font-sans text-edge-text-secondary">{selectedStrategy.entryConditions}</p>
              </div>

              <div className="p-3 rounded border border-edge-border bg-edge-surface-secondary/30 space-y-1">
                <span className="text-[10px] text-edge-profit uppercase font-bold tracking-wider">
                  Exit & Take-Profit Protocol
                </span>
                <p className="font-sans text-edge-text-secondary">{selectedStrategy.exitConditions}</p>
              </div>

              <div className="p-3 rounded border border-edge-border bg-edge-surface-secondary/30 space-y-1">
                <span className="text-[10px] text-edge-loss uppercase font-bold tracking-wider">
                  Stop Loss & Structural Invalidation
                </span>
                <p className="font-sans text-edge-text-secondary">{selectedStrategy.stopLossMethodology}</p>
              </div>

              <div className="p-3 rounded border border-edge-border bg-edge-surface-secondary/30 space-y-1">
                <span className="text-[10px] text-edge-warning uppercase font-bold tracking-wider">
                  Risk Management & Position Sizing Rules
                </span>
                <p className="font-sans text-edge-text-secondary">{selectedStrategy.riskRules}</p>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-edge-border">
              <button
                onClick={() => setSelectedStrategy(null)}
                className="px-4 py-1.5 rounded bg-edge-surface-secondary border border-edge-border text-white hover:bg-edge-surface-secondary/70 font-mono"
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Strategy Form Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-lg border border-edge-border bg-edge-surface shadow-terminal p-5 space-y-4 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-edge-border pb-3">
              <h2 className="text-sm font-bold text-white uppercase">DOCUMENT NEW STRATEGY</h2>
              <button onClick={() => setModalOpen(false)} className="text-edge-text-secondary hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="block text-[10px] text-edge-text-muted uppercase mb-1">
                  Strategy Title
                </label>
                <input
                  type="text"
                  placeholder="e.g. Asian Session Range Breakout"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-1.5 rounded bg-edge-surface-secondary border border-edge-border text-white outline-none focus:border-edge-accent"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-edge-text-muted uppercase mb-1">
                    Market Focus
                  </label>
                  <input
                    type="text"
                    value={marketType}
                    onChange={(e) => setMarketType(e.target.value)}
                    className="w-full px-3 py-1.5 rounded bg-edge-surface-secondary border border-edge-border text-white outline-none focus:border-edge-accent"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-edge-text-muted uppercase mb-1">
                    Regime
                  </label>
                  <select
                    value={marketRegime}
                    onChange={(e) => setMarketRegime(e.target.value as any)}
                    className="w-full px-3 py-1.5 rounded bg-edge-surface-secondary border border-edge-border text-white outline-none focus:border-edge-accent"
                  >
                    <option value="trending">Trending</option>
                    <option value="reversal">Reversal / Counter-trend</option>
                    <option value="breakout">Breakout / Expansion</option>
                    <option value="ranging">Ranging / Mean Reversion</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-edge-text-muted uppercase mb-1">
                  Description & Thesis
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-1.5 rounded bg-edge-surface-secondary border border-edge-border text-white font-sans text-xs outline-none focus:border-edge-accent"
                />
              </div>

              <div>
                <label className="block text-[10px] text-edge-accent uppercase mb-1">
                  Entry Trigger Conditions
                </label>
                <textarea
                  rows={2}
                  value={entryConditions}
                  onChange={(e) => setEntryConditions(e.target.value)}
                  placeholder="MSS on 5M, FVG fill, liquidity sweep..."
                  className="w-full px-3 py-1.5 rounded bg-edge-surface-secondary border border-edge-border text-white font-sans text-xs outline-none focus:border-edge-accent"
                />
              </div>

              <div>
                <label className="block text-[10px] text-edge-loss uppercase mb-1">
                  Stop Loss Methodology
                </label>
                <input
                  type="text"
                  value={stopLossMethodology}
                  onChange={(e) => setStopLossMethodology(e.target.value)}
                  placeholder="1 tick beyond swing high/low..."
                  className="w-full px-3 py-1.5 rounded bg-edge-surface-secondary border border-edge-border text-white outline-none focus:border-edge-accent"
                />
              </div>

              <div>
                <label className="block text-[10px] text-edge-profit uppercase mb-1">
                  Target & Exit Methodology
                </label>
                <input
                  type="text"
                  value={exitConditions}
                  onChange={(e) => setExitConditions(e.target.value)}
                  placeholder="Opposing liquidity pool or 2.5R..."
                  className="w-full px-3 py-1.5 rounded bg-edge-surface-secondary border border-edge-border text-white outline-none focus:border-edge-accent"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-edge-border">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-3 py-1.5 rounded text-edge-text-secondary hover:text-white"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-edge-accent text-edge-bg font-bold hover:bg-edge-accent-light"
                >
                  SAVE STRATEGY
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
