'use client';

import React, { useMemo, useState } from 'react';
import { useTrading } from '../../context/TradingContext';
import { CheckCircle2, ArrowRight, Plus, X, Pencil } from 'lucide-react';
import { Strategy } from '../../lib/data/seedData';
import { DeleteConfirmButton } from '../../components/ui/DeleteConfirmButton';
import { filterTradesByPeriod } from '../../lib/data/periodFilter';

const STRATEGY_COLORS = ['var(--tw-s1)', 'var(--tw-s2)', 'var(--tw-s3)', 'var(--tw-gain)', 'var(--tw-warn)'];

const SHORT_NAME_MAP: Record<string, string> = {
  'strat-london-sweep': 'London Sweep',
  'strat-ny-fvg': 'NY FVG',
  'strat-htf-orderflow': 'HTF Orderflow',
};

function getShortLabel(strat: Strategy): string {
  if (SHORT_NAME_MAP[strat.id]) return SHORT_NAME_MAP[strat.id];
  const words = strat.name.split(/\s+/);
  return words.slice(0, 2).join(' ');
}

function formatRegimeLabel(regime: Strategy['marketRegime']): string {
  switch (regime) {
    case 'reversal':
      return 'Reversal';
    case 'trending':
      return 'Trending';
    case 'breakout':
      return 'Breakout';
    case 'ranging':
      return 'Ranging';
    default:
      return regime;
  }
}

export default function StrategiesPage() {
  const {
    strategies,
    filteredTrades,
    selectedAccountId,
    selectedAccount,
    periodFilter,
    isPnlHidden,
    addStrategy,
    updateStrategy,
    deleteStrategy,
  } = useTrading();

  const [regimeFilter, setRegimeFilter] = useState<'all' | Strategy['marketRegime']>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingStrategy, setEditingStrategy] = useState<Strategy | null>(null);
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null);

  // Create / Edit Strategy Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [marketType, setMarketType] = useState('Forex & Metals');
  const [marketRegime, setMarketRegime] = useState<Strategy['marketRegime']>('trending');
  const [entryConditions, setEntryConditions] = useState('');
  const [exitConditions, setExitConditions] = useState('');
  const [stopLossMethodology, setStopLossMethodology] = useState('');
  const [targetMethodology, setTargetMethodology] = useState('');
  const [riskRules, setRiskRules] = useState('');
  const [checklistText, setChecklistText] = useState('');

  const formatSignedCurrency = (val: number) => {
    if (isPnlHidden) return `${val < 0 ? '−' : '+'}$••••••`;
    const abs = Math.abs(val).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    if (val === 0) return '$0.00';
    return `${val < 0 ? '−' : '+'}$${abs}`;
  };

  const resetForm = () => {
    setEditingStrategy(null);
    setName('');
    setDescription('');
    setMarketType('Forex & Metals');
    setMarketRegime('trending');
    setEntryConditions('');
    setExitConditions('');
    setStopLossMethodology('');
    setTargetMethodology('');
    setRiskRules('');
    setChecklistText(
      'Bias & market regime confirmed\nEntry trigger & displacement verified\nPosition size within account risk cap'
    );
  };

  const openNewStrategyModal = () => {
    resetForm();
    setModalOpen(true);
  };

  const openEditStrategyModal = (strat: Strategy) => {
    setEditingStrategy(strat);
    setName(strat.name);
    setDescription(strat.description || '');
    setMarketType(strat.marketType || 'Forex & Metals');
    setMarketRegime(strat.marketRegime || 'trending');
    setEntryConditions(strat.entryConditions || '');
    setExitConditions(strat.exitConditions || '');
    setStopLossMethodology(strat.stopLossMethodology || '');
    setTargetMethodology(strat.targetMethodology || '');
    setRiskRules(strat.riskRules || '');
    setChecklistText((strat.checklistItems || []).join('\n'));
    setSelectedStrategy(null);
    setModalOpen(true);
  };

  const handleSaveStrategy = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedChecklist = checklistText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (editingStrategy) {
      updateStrategy({
        ...editingStrategy,
        name: name.trim() || editingStrategy.name,
        description: description.trim(),
        marketType: marketType.trim() || 'Multi-Asset',
        marketRegime,
        entryConditions: entryConditions.trim() || 'Criteria pending definition.',
        exitConditions: exitConditions.trim() || 'Fixed 2.0R target or opposing liquidity.',
        stopLossMethodology: stopLossMethodology.trim() || 'Structural swing invalidation.',
        targetMethodology: targetMethodology.trim() || editingStrategy.targetMethodology || 'External range liquidity.',
        riskRules: riskRules.trim() || 'Max 1.0% risk per trade.',
        checklistItems: parsedChecklist.length > 0 ? parsedChecklist : editingStrategy.checklistItems,
        currentVersion: (editingStrategy.currentVersion || 1) + 1,
      });
    } else {
      addStrategy({
        name: name.trim(),
        description: description.trim(),
        marketType: marketType.trim() || 'Multi-Asset',
        marketRegime,
        entryConditions: entryConditions.trim() || 'Criteria pending definition.',
        exitConditions: exitConditions.trim() || 'Fixed 2.0R target or opposing liquidity.',
        stopLossMethodology: stopLossMethodology.trim() || 'Structural swing invalidation.',
        targetMethodology: targetMethodology.trim() || 'External range liquidity.',
        riskRules: riskRules.trim() || 'Max 1.0% risk per trade.',
        checklistItems:
          parsedChecklist.length > 0
            ? parsedChecklist
            : [
                'Bias & market regime confirmed',
                'Entry trigger & displacement verified',
                'Position size within account risk cap',
              ],
      });
    }
    setModalOpen(false);
    resetForm();
  };

  // Compute live attribution across closed trades in current scope and period
  const computed = useMemo(() => {
    const periodTrades = filterTradesByPeriod(filteredTrades, periodFilter);
    const closedTrades = periodTrades.filter((t) => t.status === 'CLOSED');
    const getTradePnl = (t: (typeof closedTrades)[number]) => {
      if (selectedAccountId === 'ALL') return t.netPnl;
      return t.allocations.find((a) => a.accountId === selectedAccountId)?.netPnl || 0;
    };

    const totalNet = closedTrades.reduce((sum, t) => sum + getTradePnl(t), 0);
    const totalWins = closedTrades.filter((t) => getTradePnl(t) > 0).length;
    const overallWinRate = closedTrades.length > 0 ? (totalWins / closedTrades.length) * 100 : 0;

    const rawStats = strategies.map((strat, index) => {
      const stratTrades = closedTrades.filter((t) => t.strategyId === strat.id);
      const wins = stratTrades.filter((t) => getTradePnl(t) > 0).length;
      const pnl = stratTrades.reduce((sum, t) => sum + getTradePnl(t), 0);
      const winRate = stratTrades.length > 0 ? (wins / stratTrades.length) * 100 : 0;

      return {
        strategy: strat,
        shortName: getShortLabel(strat),
        color: STRATEGY_COLORS[index % STRATEGY_COLORS.length],
        tradeCount: stratTrades.length,
        winRate,
        pnl,
      };
    });

    const denominator =
      Math.abs(totalNet) > 0.01
        ? Math.abs(totalNet)
        : rawStats.reduce((s, item) => s + Math.abs(item.pnl), 0);

    const enriched = rawStats.map((item) => {
      const sharePct =
        denominator > 0
          ? Math.round((Math.max(0, item.pnl) / denominator) * 1000) / 10
          : 0;
      return { ...item, sharePct };
    });

    const topStrategy =
      [...enriched].sort((a, b) => b.pnl - a.pnl)[0] || null;

    // Preserve deterministic seed/creation order or sort by total net descending
    const sorted = [...enriched].sort((a, b) => b.pnl - a.pnl);

    return {
      closedCount: closedTrades.length,
      totalNet,
      overallWinRate,
      topStrategy,
      allStats: enriched,
      sortedStats: sorted,
    };
  }, [strategies, filteredTrades, selectedAccountId, periodFilter]);

  const availableRegimes = useMemo(() => {
    const base: Strategy['marketRegime'][] = ['reversal', 'trending'];
    strategies.forEach((s) => {
      if (!base.includes(s.marketRegime)) base.push(s.marketRegime);
    });
    return base;
  }, [strategies]);

  const visibleStrategies = useMemo(() => {
    if (regimeFilter === 'all') return computed.sortedStats;
    return computed.sortedStats.filter((item) => item.strategy.marketRegime === regimeFilter);
  }, [computed.sortedStats, regimeFilter]);

  const periodNoun =
    periodFilter === 'Week'
      ? "week's"
      : periodFilter === 'Month'
      ? "month's"
      : 'all-time';

  const selectedModalStat = useMemo(() => {
    if (!selectedStrategy) return null;
    return computed.allStats.find((s) => s.strategy.id === selectedStrategy.id) || null;
  }, [selectedStrategy, computed.allStats]);

  return (
    <div className="tw-page-wrap">
      {/* Page Header */}
      <section className="tw-page-head">
        <div>
          <div className="tw-eyebrow">
            Playbook · {strategies.length} {strategies.length === 1 ? 'strategy' : 'strategies'}
          </div>
          <h1 className="tw-page-title">Strategy playbook &amp; quantitative audit</h1>
          <p className="tw-page-lede">
            Systematic setup rules, execution checklists and live attribution. Share of net shows each strategy&apos;s part of the {periodNoun} total.
          </p>
        </div>
        <button
          type="button"
          onClick={openNewStrategyModal}
          className="tw-sun-cta"
        >
          <Plus size={16} aria-hidden="true" />
          <span>New strategy</span>
        </button>
      </section>

      {/* Main Bento Canvas */}
      <main className="tw-bento-12">
        {/* Portfolio Summary Hero Tile */}
        <article className="tw-bento-tile tw-strat-hero" aria-label="Portfolio summary">
          <div>
            <div className="tw-slab">
              Total net · {selectedAccountId === 'ALL' ? 'all strategies' : selectedAccount?.name}
            </div>
            <div className="tw-sbig">{formatSignedCurrency(computed.totalNet)}</div>
            <div className="tw-smeta">
              <div>
                Trades
                <b>{computed.closedCount}</b>
              </div>
              <div>
                Win rate
                <b>{computed.overallWinRate.toFixed(1)}%</b>
              </div>
              <div>
                Top strategy
                <b>{computed.topStrategy ? computed.topStrategy.shortName : '—'}</b>
              </div>
            </div>
          </div>

          <div>
            <div className="tw-slab">Share of net</div>
            <div
              className="tw-strat-share-bar"
              role="img"
              aria-label={computed.allStats
                .map((s) => `${s.shortName} ${s.sharePct.toFixed(1)}%`)
                .join(', ')}
            >
              {computed.allStats.map((item) => (
                <span
                  key={item.strategy.id}
                  style={{
                    width: `${item.sharePct}%`,
                    background: item.color,
                  }}
                />
              ))}
            </div>
            <div className="tw-strat-legend">
              {computed.allStats.map((item) => (
                <div key={item.strategy.id}>
                  <span>
                    <i style={{ background: item.color }} />
                    {item.shortName}
                  </span>
                  <span className="font-mono tabular-nums">{item.sharePct.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        </article>

        {/* Regime Filter Bar */}
        <div className="tw-strat-filters">
          <div className="tw-pill-seg" role="group" aria-label="Filter by type">
            <button
              type="button"
              aria-pressed={regimeFilter === 'all'}
              onClick={() => setRegimeFilter('all')}
            >
              All
            </button>
            {availableRegimes.map((regime) => (
              <button
                key={regime}
                type="button"
                aria-pressed={regimeFilter === regime}
                onClick={() => setRegimeFilter(regime)}
              >
                {formatRegimeLabel(regime)}
              </button>
            ))}
          </div>
          <span
            className="font-mono text-xs tabular-nums"
            style={{ color: 'var(--tw-ink-3)' }}
          >
            Sorted by total net
          </span>
        </div>

        {/* Strategy Playbook Cards */}
        {visibleStrategies.map(({ strategy, color, tradeCount, winRate, pnl, sharePct }) => {
          const tagClass =
            strategy.marketRegime === 'reversal'
              ? 'rev'
              : strategy.marketRegime === 'breakout' || strategy.marketRegime === 'ranging'
              ? 'breakout'
              : 'trend';

          return (
            <article key={strategy.id} className="tw-bento-tile tw-strat-card">
              <div className="flex items-start justify-between gap-3">
                <span className={`tw-strat-tag ${tagClass}`}>
                  {formatRegimeLabel(strategy.marketRegime)}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => openEditStrategyModal(strategy)}
                    title={`Edit ${strategy.name}`}
                    aria-label={`Edit ${strategy.name}`}
                    className="w-10 h-10 rounded-full border border-[var(--tw-line-strong)] bg-transparent hover:bg-[var(--tw-pill)] flex items-center justify-center transition-colors"
                    style={{ color: 'var(--tw-ink-2)' }}
                  >
                    <Pencil size={15} />
                  </button>
                  <DeleteConfirmButton
                    variant="icon"
                    size={15}
                    title={`Delete ${strategy.name}`}
                    ariaLabel={`Delete ${strategy.name}`}
                    className="!w-10 !h-10 !rounded-full !border !border-[var(--tw-line-strong)] !bg-transparent hover:!bg-[var(--tw-pill)]"
                    onConfirm={() => deleteStrategy(strategy.id)}
                  />
                </div>
              </div>

              <h2
                className="text-[19px] font-bold leading-snug tracking-tight m-0"
                style={{ color: 'var(--tw-ink)' }}
              >
                {strategy.name}
              </h2>

              <p
                className="text-[14px] leading-relaxed m-0"
                style={{ color: 'var(--tw-ink-2)' }}
              >
                {strategy.description}
              </p>

              {/* Share of Net Progress Bar */}
              <div className="grid gap-1.5">
                <div
                  className="flex justify-between text-xs"
                  style={{ color: 'var(--tw-ink-3)' }}
                >
                  <span>Share of net</span>
                  <span className="font-mono tabular-nums">{sharePct.toFixed(1)}%</span>
                </div>
                <div
                  className="h-2 rounded-full overflow-hidden"
                  style={{ background: 'var(--tw-track)' }}
                >
                  <span
                    className="block h-full rounded-full transition-all duration-300"
                    style={{ width: `${sharePct}%`, background: color }}
                  />
                </div>
              </div>

              {/* 3-Column Metrics Box */}
              <div className="tw-strat-stats">
                <div>
                  <small>Trades</small>
                  <strong>{tradeCount}</strong>
                </div>
                <div>
                  <small>Win rate</small>
                  <strong>{winRate.toFixed(1)}%</strong>
                </div>
                <div>
                  <small>Total net</small>
                  <strong
                    style={{
                      color:
                        pnl > 0
                          ? 'var(--tw-gain)'
                          : pnl < 0
                          ? 'var(--tw-loss)'
                          : 'var(--tw-ink)',
                    }}
                  >
                    {formatSignedCurrency(pnl)}
                  </strong>
                </div>
              </div>

              {/* Core Criteria Checklist */}
              <ul className="tw-strat-checks">
                <h3>Core criteria</h3>
                {strategy.checklistItems.slice(0, 3).map((item, idx) => (
                  <li key={idx}>
                    <CheckCircle2
                      size={16}
                      className="shrink-0 mt-0.5"
                      style={{ color: 'var(--tw-gain)' }}
                      aria-hidden="true"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              {/* Footer Button */}
              <div className="mt-auto pt-1">
                <button
                  type="button"
                  onClick={() => setSelectedStrategy(strategy)}
                  className="tw-strat-rules-btn"
                >
                  <span>View playbook rules</span>
                  <ArrowRight size={14} aria-hidden="true" />
                </button>
              </div>
            </article>
          );
        })}

        {visibleStrategies.length === 0 && (
          <div
            className="tw-ana-span12 text-center py-12 text-sm"
            style={{ color: 'var(--tw-ink-3)' }}
          >
            No strategies match this filter.
          </div>
        )}
      </main>

      {/* Playbook Rules Detail Modal (Light & Dark Tidewater Styled) */}
      {selectedStrategy && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="strat-detail-title"
        >
          <div
            className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-[28px] p-6 space-y-5"
            style={{
              background: 'var(--tw-tile)',
              color: 'var(--tw-ink)',
              border: '1px solid var(--tw-line-strong)',
              boxShadow: 'var(--tw-shadow-dropdown)',
            }}
          >
            <div
              className="flex items-start justify-between gap-4 pb-4"
              style={{ borderBottom: '1px solid var(--tw-line)' }}
            >
              <div>
                <span className="tw-strat-tag trend">
                  {selectedStrategy.marketType} · {formatRegimeLabel(selectedStrategy.marketRegime)}
                </span>
                <h2
                  id="strat-detail-title"
                  className="text-xl font-bold tracking-tight mt-2"
                  style={{ color: 'var(--tw-ink)' }}
                >
                  {selectedStrategy.name}
                </h2>
                {selectedModalStat && (
                  <p className="text-xs font-mono mt-1" style={{ color: 'var(--tw-ink-3)' }}>
                    {selectedModalStat.tradeCount} trades · {selectedModalStat.winRate.toFixed(1)}% win rate ·{' '}
                    {formatSignedCurrency(selectedModalStat.pnl)} net ({selectedModalStat.sharePct.toFixed(1)}% share)
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedStrategy(null)}
                aria-label="Close playbook modal"
                className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
                style={{
                  border: '1px solid var(--tw-line-strong)',
                  color: 'var(--tw-ink-2)',
                  background: 'transparent',
                }}
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-sm leading-relaxed" style={{ color: 'var(--tw-ink-2)' }}>
              {selectedStrategy.description}
            </p>

            <div className="grid gap-3">
              <div
                className="p-4 rounded-2xl space-y-1"
                style={{ background: 'var(--tw-pill)', border: '1px solid var(--tw-line)' }}
              >
                <span
                  className="font-mono text-[11px] uppercase tracking-wider font-semibold"
                  style={{ color: 'var(--tw-s1)' }}
                >
                  Entry Trigger Protocol
                </span>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--tw-ink)' }}>
                  {selectedStrategy.entryConditions}
                </p>
              </div>

              <div
                className="p-4 rounded-2xl space-y-1"
                style={{ background: 'var(--tw-pill)', border: '1px solid var(--tw-line)' }}
              >
                <span
                  className="font-mono text-[11px] uppercase tracking-wider font-semibold"
                  style={{ color: 'var(--tw-gain)' }}
                >
                  Exit &amp; Take-Profit Protocol
                </span>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--tw-ink)' }}>
                  {selectedStrategy.exitConditions}
                </p>
              </div>

              <div
                className="p-4 rounded-2xl space-y-1"
                style={{ background: 'var(--tw-pill)', border: '1px solid var(--tw-line)' }}
              >
                <span
                  className="font-mono text-[11px] uppercase tracking-wider font-semibold"
                  style={{ color: 'var(--tw-loss)' }}
                >
                  Stop Loss &amp; Structural Invalidation
                </span>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--tw-ink)' }}>
                  {selectedStrategy.stopLossMethodology}
                </p>
              </div>

              <div
                className="p-4 rounded-2xl space-y-1"
                style={{ background: 'var(--tw-pill)', border: '1px solid var(--tw-line)' }}
              >
                <span
                  className="font-mono text-[11px] uppercase tracking-wider font-semibold"
                  style={{ color: 'var(--tw-warn)' }}
                >
                  Risk Management &amp; Position Sizing Rules
                </span>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--tw-ink)' }}>
                  {selectedStrategy.riskRules}
                </p>
              </div>
            </div>

            <div
              className="flex items-center justify-between pt-4"
              style={{ borderTop: '1px solid var(--tw-line)' }}
            >
              <DeleteConfirmButton
                variant="button"
                label="Delete strategy"
                confirmLabel="Confirm delete"
                onConfirm={() => {
                  deleteStrategy(selectedStrategy.id);
                  setSelectedStrategy(null);
                }}
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openEditStrategyModal(selectedStrategy)}
                  className="px-4 py-2 rounded-full text-sm font-semibold inline-flex items-center gap-1.5"
                  style={{
                    border: '1px solid var(--tw-line-strong)',
                    color: 'var(--tw-ink)',
                  }}
                >
                  <Pencil size={13} />
                  <span>Edit playbook</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedStrategy(null)}
                  className="px-5 py-2 rounded-full text-sm font-semibold"
                  style={{
                    background: 'var(--tw-hero)',
                    color: 'var(--tw-hero-ink)',
                  }}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Strategy Form Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-strat-title"
        >
          <div
            className="relative w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-[28px] p-6 space-y-4"
            style={{
              background: 'var(--tw-tile)',
              color: 'var(--tw-ink)',
              border: '1px solid var(--tw-line-strong)',
              boxShadow: 'var(--tw-shadow-dropdown)',
            }}
          >
            <div
              className="flex items-center justify-between pb-3"
              style={{ borderBottom: '1px solid var(--tw-line)' }}
            >
              <h2
                id="new-strat-title"
                className="text-lg font-bold tracking-tight"
                style={{ color: 'var(--tw-ink)' }}
              >
                {editingStrategy ? `Edit playbook · ${editingStrategy.name}` : 'New playbook strategy'}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  resetForm();
                }}
                aria-label="Close strategy modal"
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{
                  border: '1px solid var(--tw-line-strong)',
                  color: 'var(--tw-ink-2)',
                }}
              >
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleSaveStrategy} className="space-y-3.5 text-sm">
              <div>
                <label
                  className="block font-mono text-[11px] uppercase tracking-wider mb-1"
                  style={{ color: 'var(--tw-ink-3)' }}
                >
                  Strategy title
                </label>
                <input
                  type="text"
                  placeholder="e.g. Asian Session Range Breakout"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl outline-none"
                  style={{
                    background: 'var(--tw-pill)',
                    border: '1px solid var(--tw-line-strong)',
                    color: 'var(--tw-ink)',
                  }}
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    className="block font-mono text-[11px] uppercase tracking-wider mb-1"
                    style={{ color: 'var(--tw-ink-3)' }}
                  >
                    Market focus
                  </label>
                  <input
                    type="text"
                    value={marketType}
                    onChange={(e) => setMarketType(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl outline-none"
                    style={{
                      background: 'var(--tw-pill)',
                      border: '1px solid var(--tw-line-strong)',
                      color: 'var(--tw-ink)',
                    }}
                  />
                </div>

                <div>
                  <label
                    className="block font-mono text-[11px] uppercase tracking-wider mb-1"
                    style={{ color: 'var(--tw-ink-3)' }}
                  >
                    Regime
                  </label>
                  <select
                    value={marketRegime}
                    onChange={(e) => setMarketRegime(e.target.value as Strategy['marketRegime'])}
                    className="w-full px-3.5 py-2 rounded-xl outline-none"
                    style={{
                      background: 'var(--tw-pill)',
                      border: '1px solid var(--tw-line-strong)',
                      color: 'var(--tw-ink)',
                    }}
                  >
                    <option value="trending">Trending</option>
                    <option value="reversal">Reversal</option>
                    <option value="breakout">Breakout</option>
                    <option value="ranging">Ranging</option>
                  </select>
                </div>
              </div>

              <div>
                <label
                  className="block font-mono text-[11px] uppercase tracking-wider mb-1"
                  style={{ color: 'var(--tw-ink-3)' }}
                >
                  Description &amp; thesis
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl outline-none"
                  style={{
                    background: 'var(--tw-pill)',
                    border: '1px solid var(--tw-line-strong)',
                    color: 'var(--tw-ink)',
                  }}
                />
              </div>

              <div>
                <label
                  className="block font-mono text-[11px] uppercase tracking-wider mb-1"
                  style={{ color: 'var(--tw-s1)' }}
                >
                  Entry trigger conditions
                </label>
                <textarea
                  rows={2}
                  value={entryConditions}
                  onChange={(e) => setEntryConditions(e.target.value)}
                  placeholder="MSS on 5M, FVG fill, liquidity sweep..."
                  className="w-full px-3.5 py-2 rounded-xl outline-none"
                  style={{
                    background: 'var(--tw-pill)',
                    border: '1px solid var(--tw-line-strong)',
                    color: 'var(--tw-ink)',
                  }}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    className="block font-mono text-[11px] uppercase tracking-wider mb-1"
                    style={{ color: 'var(--tw-loss)' }}
                  >
                    Stop loss methodology
                  </label>
                  <input
                    type="text"
                    value={stopLossMethodology}
                    onChange={(e) => setStopLossMethodology(e.target.value)}
                    placeholder="1 tick beyond swing high/low..."
                    className="w-full px-3.5 py-2 rounded-xl outline-none"
                    style={{
                      background: 'var(--tw-pill)',
                      border: '1px solid var(--tw-line-strong)',
                      color: 'var(--tw-ink)',
                    }}
                  />
                </div>

                <div>
                  <label
                    className="block font-mono text-[11px] uppercase tracking-wider mb-1"
                    style={{ color: 'var(--tw-gain)' }}
                  >
                    Target &amp; exit methodology
                  </label>
                  <input
                    type="text"
                    value={exitConditions}
                    onChange={(e) => setExitConditions(e.target.value)}
                    placeholder="Opposing liquidity or 2.5R..."
                    className="w-full px-3.5 py-2 rounded-xl outline-none"
                    style={{
                      background: 'var(--tw-pill)',
                      border: '1px solid var(--tw-line-strong)',
                      color: 'var(--tw-ink)',
                    }}
                  />
                </div>
              </div>

              <div>
                <label
                  className="block font-mono text-[11px] uppercase tracking-wider mb-1"
                  style={{ color: 'var(--tw-warn)' }}
                >
                  Risk management &amp; sizing rules
                </label>
                <input
                  type="text"
                  value={riskRules}
                  onChange={(e) => setRiskRules(e.target.value)}
                  placeholder="Max 1.0% risk per trade, no trades within 15m of red-folder news..."
                  className="w-full px-3.5 py-2 rounded-xl outline-none"
                  style={{
                    background: 'var(--tw-pill)',
                    border: '1px solid var(--tw-line-strong)',
                    color: 'var(--tw-ink)',
                  }}
                />
              </div>

              <div>
                <label
                  className="block font-mono text-[11px] uppercase tracking-wider mb-1"
                  style={{ color: 'var(--tw-ink-3)' }}
                >
                  Core criteria checklist (one rule per line)
                </label>
                <textarea
                  rows={3}
                  value={checklistText}
                  onChange={(e) => setChecklistText(e.target.value)}
                  placeholder="Bias & market regime confirmed&#10;Entry trigger & displacement verified&#10;Position size within account risk cap"
                  className="w-full px-3.5 py-2 rounded-xl outline-none"
                  style={{
                    background: 'var(--tw-pill)',
                    border: '1px solid var(--tw-line-strong)',
                    color: 'var(--tw-ink)',
                  }}
                />
              </div>

              <div
                className="flex justify-end gap-2 pt-3"
                style={{ borderTop: '1px solid var(--tw-line)' }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setModalOpen(false);
                    resetForm();
                  }}
                  className="px-4 py-2 rounded-full text-sm font-medium"
                  style={{
                    border: '1px solid var(--tw-line-strong)',
                    color: 'var(--tw-ink-2)',
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="tw-sun-cta !py-2">
                  {editingStrategy ? 'Save changes' : 'Save strategy'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
