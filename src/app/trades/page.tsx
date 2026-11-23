'use client';

import React, { useState, useMemo } from 'react';
import { useTrading } from '../../context/TradingContext';
import {
  ArrowLeftRight,
  Plus,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  Eye,
  CheckCircle2,
  Trash2,
  Scissors,
  Layers,
  Clock,
  Briefcase
} from 'lucide-react';
import { Trade, TradeAllocation, TradeExecution } from '../../lib/types/financial';
import { QuickTradeModal } from '../../components/modals/QuickTradeModal';

export default function TradesPage() {
  const {
    filteredTrades,
    instruments,
    strategies,
    accounts,
    deleteTrade,
    executePartialClose
  } = useTrading();

  const [quickTradeOpen, setQuickTradeOpen] = useState(false);
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);

  // Partial close modal state
  const [partialCloseAllocation, setPartialCloseAllocation] = useState<TradeAllocation | null>(null);
  const [partialCloseSize, setPartialCloseSize] = useState<string>('0.5');
  const [partialClosePrice, setPartialClosePrice] = useState<string>('');

  // Table filters
  const [filterSymbol, setFilterSymbol] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterDirection, setFilterDirection] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const displayTrades = useMemo(() => {
    return filteredTrades.filter((t) => {
      if (filterSymbol !== 'ALL' && t.instrumentSymbol !== filterSymbol) return false;
      if (filterStatus !== 'ALL' && t.status !== filterStatus) return false;
      if (filterDirection !== 'ALL' && t.direction !== filterDirection) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchSymbol = t.instrumentSymbol.toLowerCase().includes(q);
        const matchSetup = t.setupType?.toLowerCase().includes(q);
        const matchStrategy = t.strategyName?.toLowerCase().includes(q);
        const matchTags = t.tags.some((tag) => tag.toLowerCase().includes(q));
        if (!matchSymbol && !matchSetup && !matchStrategy && !matchTags) return false;
      }
      return true;
    });
  }, [filteredTrades, filterSymbol, filterStatus, filterDirection, searchQuery]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(val);
  };

  const handleOpenPartialClose = (trade: Trade, alloc: TradeAllocation) => {
    setSelectedTrade(trade);
    setPartialCloseAllocation(alloc);
    setPartialCloseSize((alloc.allocatedPositionSize / 2).toFixed(2));
    setPartialClosePrice(trade.entryPrice.toString());
  };

  const handleConfirmPartialClose = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTrade || !partialCloseAllocation) return;

    const size = parseFloat(partialCloseSize) || 0;
    const price = parseFloat(partialClosePrice) || selectedTrade.entryPrice;

    if (size <= 0) return;

    executePartialClose(
      selectedTrade.id,
      partialCloseAllocation.id,
      size,
      price,
      5, // commission
      0, // swap
      `Partial close executed via Trade Terminal`
    );

    setPartialCloseAllocation(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-edge-border">
        <div>
          <div className="flex items-center space-x-2">
            <ArrowLeftRight size={20} className="text-edge-accent" />
            <h1 className="text-xl font-mono font-bold tracking-tight text-white uppercase">
              TRADE EXECUTION LEDGER
            </h1>
          </div>
          <p className="text-xs text-edge-text-secondary mt-0.5">
            Logical trade orders, multi-account allocations, and scale-out executions.
          </p>
        </div>

        <button
          onClick={() => setQuickTradeOpen(true)}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-edge-accent text-edge-bg hover:bg-edge-accent-light font-mono text-xs font-semibold tracking-wide transition-colors self-start sm:self-auto"
        >
          <Plus size={14} />
          <span>NEW EXECUTION</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg border border-edge-border bg-edge-surface font-mono text-xs">
        <input
          type="text"
          placeholder="Search by asset, setup, strategy, or tag..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="px-3 py-1.5 rounded bg-edge-surface-secondary border border-edge-border text-white text-xs outline-none focus:border-edge-accent flex-1 min-w-[200px]"
        />

        <select
          value={filterSymbol}
          onChange={(e) => setFilterSymbol(e.target.value)}
          className="px-2.5 py-1.5 rounded bg-edge-surface-secondary border border-edge-border text-edge-text-secondary outline-none focus:border-edge-accent"
        >
          <option value="ALL">All Instruments</option>
          {instruments.map((i) => (
            <option key={i.symbol} value={i.symbol}>
              {i.symbol}
            </option>
          ))}
        </select>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-2.5 py-1.5 rounded bg-edge-surface-secondary border border-edge-border text-edge-text-secondary outline-none focus:border-edge-accent"
        >
          <option value="ALL">All Statuses</option>
          <option value="OPEN">Open Only</option>
          <option value="CLOSED">Closed Only</option>
          <option value="PLANNED">Planned</option>
        </select>

        <select
          value={filterDirection}
          onChange={(e) => setFilterDirection(e.target.value)}
          className="px-2.5 py-1.5 rounded bg-edge-surface-secondary border border-edge-border text-edge-text-secondary outline-none focus:border-edge-accent"
        >
          <option value="ALL">All Directions</option>
          <option value="BUY">Buy / Long</option>
          <option value="SELL">Sell / Short</option>
        </select>
      </div>

      {/* Main Trades Table */}
      <div className="rounded-lg border border-edge-border bg-edge-surface overflow-hidden shadow-terminal">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-edge-border bg-edge-surface-secondary/60 text-[10px] text-edge-text-muted uppercase">
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Asset</th>
                <th className="py-2.5 px-3">Direction</th>
                <th className="py-2.5 px-3">Entry / Stop / Target</th>
                <th className="py-2.5 px-3">Strategy / Setup</th>
                <th className="py-2.5 px-3">Allocations</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Realized R</th>
                <th className="py-2.5 px-3 text-right">Net P&L</th>
                <th className="py-2.5 px-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-edge-border/40">
              {displayTrades.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-edge-text-muted">
                    No trades match the current filter selection.
                  </td>
                </tr>
              ) : (
                displayTrades.map((trade) => {
                  const isOpen = trade.status === 'OPEN';
                  const isBuy = trade.direction === 'BUY';

                  return (
                    <tr
                      key={trade.id}
                      className="hover:bg-edge-surface-secondary/40 transition-colors"
                    >
                      <td className="py-3 px-3 text-edge-text-secondary text-[11px]">
                        {new Date(trade.createdAt).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>

                      <td className="py-3 px-3">
                        <div className="font-bold text-white text-xs">{trade.instrumentSymbol}</div>
                        <div className="text-[10px] text-edge-text-muted">
                          {trade.timeframe} • {trade.session}
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            isBuy
                              ? 'bg-edge-profit/15 text-edge-profit'
                              : 'bg-edge-loss/15 text-edge-loss'
                          }`}
                        >
                          {isBuy ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                          <span>{trade.direction}</span>
                        </span>
                      </td>

                      <td className="py-3 px-3 text-edge-text-secondary tabular-nums text-[11px]">
                        <div>In: {trade.entryPrice.toLocaleString()}</div>
                        <div className="text-[10px] text-edge-loss">SL: {trade.stopLoss.toLocaleString()}</div>
                        {trade.takeProfit && (
                          <div className="text-[10px] text-edge-profit">TP: {trade.takeProfit.toLocaleString()}</div>
                        )}
                      </td>

                      <td className="py-3 px-3">
                        <div className="text-white font-medium truncate max-w-[150px]">
                          {trade.strategyName || 'Discretionary'}
                        </div>
                        <div className="text-[10px] text-edge-text-muted truncate max-w-[150px]">
                          {trade.setupType}
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="flex flex-col gap-1">
                          {trade.allocations.map((alloc) => (
                            <span
                              key={alloc.id}
                              className="text-[10px] text-edge-text-secondary truncate max-w-[130px]"
                            >
                              {alloc.accountName || 'Account'}: {alloc.allocatedPositionSize} lots
                            </span>
                          ))}
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                            isOpen
                              ? 'bg-edge-accent/20 text-edge-accent border border-edge-accent/40 animate-pulse'
                              : 'bg-edge-surface-secondary text-edge-text-muted'
                          }`}
                        >
                          {trade.status}
                        </span>
                      </td>

                      <td className="py-3 px-3 tabular-nums font-bold">
                        {trade.status === 'CLOSED'
                          ? `${trade.realizedR > 0 ? '+' : ''}${trade.realizedR.toFixed(2)}R`
                          : '—'}
                      </td>

                      <td
                        className={`py-3 px-3 text-right tabular-nums font-bold text-xs ${
                          trade.netPnl >= 0 ? 'text-edge-profit' : 'text-edge-loss'
                        }`}
                      >
                        {trade.status === 'CLOSED' ? (
                          <>
                            {trade.netPnl >= 0 ? '+' : ''}
                            {formatCurrency(trade.netPnl)}
                          </>
                        ) : (
                          <span className="text-edge-warning">ACTIVE</span>
                        )}
                      </td>

                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center space-x-1">
                          <button
                            onClick={() => setSelectedTrade(trade)}
                            className="p-1.5 rounded text-edge-text-muted hover:text-white hover:bg-edge-surface-secondary transition-colors"
                            title="View Executions & Allocations"
                          >
                            <Eye size={14} />
                          </button>

                          {isOpen && trade.allocations.length > 0 && (
                            <button
                              onClick={() => handleOpenPartialClose(trade, trade.allocations[0])}
                              className="p-1.5 rounded text-edge-accent hover:bg-edge-accent/15 transition-colors"
                              title="Partial Close Execution"
                            >
                              <Scissors size={14} />
                            </button>
                          )}

                          <button
                            onClick={() => deleteTrade(trade.id)}
                            className="p-1.5 rounded text-edge-text-muted hover:text-edge-loss hover:bg-edge-surface-secondary transition-colors"
                            title="Delete Trade"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Trade Details & Executions Drawer */}
      {selectedTrade && !partialCloseAllocation && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-xl h-full bg-edge-surface border-l border-edge-border shadow-terminal flex flex-col text-xs font-mono">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-edge-border bg-edge-surface-secondary/50">
              <div className="flex items-center space-x-2">
                <span className="font-bold text-white uppercase text-sm">
                  {selectedTrade.instrumentSymbol} {selectedTrade.direction}
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-edge-accent/15 text-edge-accent border border-edge-accent/30 font-semibold">
                  {selectedTrade.status}
                </span>
              </div>
              <button
                onClick={() => setSelectedTrade(null)}
                className="text-edge-text-secondary hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Financial Summary */}
              <div className="grid grid-cols-3 gap-3 p-3 rounded border border-edge-border bg-edge-surface-secondary/40">
                <div>
                  <span className="block text-[9px] text-edge-text-muted uppercase">Realized Net P&L</span>
                  <span
                    className={`text-sm font-bold tabular-nums ${
                      selectedTrade.netPnl >= 0 ? 'text-edge-profit' : 'text-edge-loss'
                    }`}
                  >
                    {selectedTrade.netPnl >= 0 ? '+' : ''}{formatCurrency(selectedTrade.netPnl)}
                  </span>
                </div>
                <div>
                  <span className="block text-[9px] text-edge-text-muted uppercase">Realized R</span>
                  <span className="text-sm font-bold text-white tabular-nums">
                    {selectedTrade.realizedR > 0 ? '+' : ''}{selectedTrade.realizedR}R
                  </span>
                </div>
                <div>
                  <span className="block text-[9px] text-edge-text-muted uppercase">Total Fees & Comm</span>
                  <span className="text-sm font-bold text-edge-text-secondary tabular-nums">
                    {formatCurrency(selectedTrade.totalCommission + selectedTrade.totalSwap)}
                  </span>
                </div>
              </div>

              {/* Order Specifications */}
              <div className="space-y-2 p-3 rounded border border-edge-border bg-edge-surface-secondary/20">
                <h4 className="font-bold text-edge-accent text-[11px] uppercase tracking-wider">
                  EXECUTION PARAMETERS
                </h4>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-edge-text-muted">Entry Price: </span>
                    <span className="text-white font-semibold">{selectedTrade.entryPrice}</span>
                  </div>
                  <div>
                    <span className="text-edge-text-muted">Stop Loss: </span>
                    <span className="text-edge-loss font-semibold">{selectedTrade.stopLoss}</span>
                  </div>
                  <div>
                    <span className="text-edge-text-muted">Take Profit: </span>
                    <span className="text-edge-profit font-semibold">{selectedTrade.takeProfit || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-edge-text-muted">Planned R:R: </span>
                    <span className="text-white font-semibold">1:{selectedTrade.plannedRr}</span>
                  </div>
                </div>
              </div>

              {/* Multi-Account Allocations */}
              <div className="space-y-2">
                <h4 className="font-bold text-edge-accent text-[11px] uppercase tracking-wider">
                  MULTI-ACCOUNT ALLOCATIONS ({selectedTrade.allocations.length})
                </h4>
                {selectedTrade.allocations.map((alloc) => (
                  <div
                    key={alloc.id}
                    className="p-3 rounded border border-edge-border bg-edge-surface-secondary/40 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white">{alloc.accountName || alloc.accountId}</span>
                      <span className="text-[10px] text-edge-text-muted uppercase font-bold">
                        {alloc.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-[11px]">
                      <div>
                        <span className="text-edge-text-muted block text-[9px]">Size</span>
                        <span className="font-semibold text-white">{alloc.allocatedPositionSize} Lots</span>
                      </div>
                      <div>
                        <span className="text-edge-text-muted block text-[9px]">Risk USD</span>
                        <span className="font-semibold text-edge-loss">-${alloc.allocatedRiskUsd}</span>
                      </div>
                      <div>
                        <span className="text-edge-text-muted block text-[9px]">Net P&L</span>
                        <span
                          className={`font-semibold ${
                            alloc.netPnl >= 0 ? 'text-edge-profit' : 'text-edge-loss'
                          }`}
                        >
                          {alloc.netPnl >= 0 ? '+' : ''}{formatCurrency(alloc.netPnl)}
                        </span>
                      </div>
                    </div>

                    {/* Order Executions List */}
                    {alloc.executions.length > 0 && (
                      <div className="pt-2 border-t border-edge-border/50 space-y-1">
                        <span className="text-[9px] uppercase text-edge-text-muted font-bold block">
                          Execution Fills
                        </span>
                        {alloc.executions.map((exec) => (
                          <div
                            key={exec.id}
                            className="flex justify-between items-center text-[10px] text-edge-text-secondary bg-edge-surface/60 p-1.5 rounded"
                          >
                            <span>
                              {exec.executionType}: {exec.size} lots @ {exec.price}
                            </span>
                            <span
                              className={exec.realizedPnl >= 0 ? 'text-edge-profit' : 'text-edge-loss'}
                            >
                              {exec.realizedPnl !== 0
                                ? `${exec.realizedPnl >= 0 ? '+' : ''}${formatCurrency(exec.realizedPnl)}`
                                : 'ENTRY'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Thesis */}
              {selectedTrade.tradeThesis && (
                <div className="p-3 rounded border border-edge-border bg-edge-surface-secondary/20 space-y-1">
                  <h4 className="font-bold text-edge-accent text-[11px] uppercase tracking-wider">
                    TRADE THESIS
                  </h4>
                  <p className="font-sans text-edge-text-secondary leading-relaxed">
                    {selectedTrade.tradeThesis}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Partial Close Execution Modal */}
      {partialCloseAllocation && selectedTrade && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md rounded-lg border border-edge-border bg-edge-surface shadow-terminal p-4 space-y-4 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-edge-border pb-3">
              <div className="flex items-center space-x-2">
                <Scissors size={16} className="text-edge-accent" />
                <h3 className="font-bold text-white uppercase">EXECUTE PARTIAL CLOSE</h3>
              </div>
              <button
                onClick={() => setPartialCloseAllocation(null)}
                className="text-edge-text-secondary hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmPartialClose} className="space-y-3">
              <div>
                <span className="text-edge-text-muted text-[10px] uppercase block mb-1">
                  Current Open Size: {partialCloseAllocation.allocatedPositionSize} Lots
                </span>
                <label className="block text-edge-text-secondary text-[11px] mb-1">
                  Lots to Close:
                </label>
                <input
                  type="number"
                  step="0.01"
                  max={partialCloseAllocation.allocatedPositionSize}
                  value={partialCloseSize}
                  onChange={(e) => setPartialCloseSize(e.target.value)}
                  className="w-full px-3 py-1.5 rounded bg-edge-surface-secondary border border-edge-border text-white font-mono focus:border-edge-accent outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-edge-text-secondary text-[11px] mb-1">
                  Exit / Fill Price:
                </label>
                <input
                  type="number"
                  step="any"
                  value={partialClosePrice}
                  onChange={(e) => setPartialClosePrice(e.target.value)}
                  className="w-full px-3 py-1.5 rounded bg-edge-surface-secondary border border-edge-border text-white font-mono focus:border-edge-accent outline-none"
                  required
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-edge-border">
                <button
                  type="button"
                  onClick={() => setPartialCloseAllocation(null)}
                  className="px-3 py-1.5 rounded text-edge-text-secondary hover:text-white"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-edge-accent text-edge-bg font-bold hover:bg-edge-accent-light transition-colors"
                >
                  CONFIRM PARTIAL CLOSE
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <QuickTradeModal
        isOpen={quickTradeOpen}
        onClose={() => setQuickTradeOpen(false)}
      />
    </div>
  );
}
