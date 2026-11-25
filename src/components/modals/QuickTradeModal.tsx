'use client';

import React, { useState, useEffect } from 'react';
import { useTrading } from '../../context/TradingContext';
import { calculatePositionSize } from '../../lib/calculations/financialEngine';
import { Trade, TradeDirection, TradeStatus } from '../../lib/types/financial';
import { X, CheckSquare, Square, Calculator, AlertCircle, ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface QuickTradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  editTrade?: Trade | null;
}

export const QuickTradeModal: React.FC<QuickTradeModalProps> = ({
  isOpen,
  onClose,
  editTrade = null,
}) => {
  const { accounts, selectedAccountId, instruments, strategies, addTrade, updateTrade } = useTrading();

  // Form State - Clean blank defaults with informative placeholders
  const [symbol, setSymbol] = useState('XAUUSD');
  const [direction, setDirection] = useState<TradeDirection>('BUY');
  const [entryPrice, setEntryPrice] = useState<string>('');
  const [stopLoss, setStopLoss] = useState<string>('');
  const [takeProfit, setTakeProfit] = useState<string>('');
  const [riskPct, setRiskPct] = useState<string>('1.0');
  const [strategyId, setStrategyId] = useState<string>('');
  const [setupType, setSetupType] = useState<string>('');
  const [session, setSession] = useState<'Asian' | 'London' | 'London Close' | 'New York' | 'Sydney'>('London');
  const [timeframe, setTimeframe] = useState<string>('15M');
  const [status, setStatus] = useState<TradeStatus>('OPEN');
  const [tradeThesis, setTradeThesis] = useState<string>('');
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);

  // Pre-trade checklist
  const [checklist, setChecklist] = useState({
    biasConfirmed: false,
    validTrigger: false,
    slTechnical: false,
    riskWithinLimits: true,
    noRedFolderNews: true,
    noFomo: true,
  });

  const activeInstrument = instruments.find((i) => i.symbol === symbol) || instruments[0];

  // Populate form state when opening in Edit Mode vs New Mode
  useEffect(() => {
    if (!isOpen) return;
    if (editTrade) {
      setSymbol(editTrade.instrumentSymbol || 'XAUUSD');
      setDirection(editTrade.direction || 'BUY');
      setEntryPrice(editTrade.entryPrice ? String(editTrade.entryPrice) : '');
      setStopLoss(editTrade.stopLoss ? String(editTrade.stopLoss) : '');
      setTakeProfit(editTrade.takeProfit ? String(editTrade.takeProfit) : '');
      setRiskPct(editTrade.plannedRiskPct ? String(editTrade.plannedRiskPct) : '1.0');
      setStrategyId(editTrade.strategyId || '');
      setSetupType(editTrade.setupType || '');
      setSession((editTrade.session as typeof session) || 'London');
      setTimeframe(editTrade.timeframe || '15M');
      setStatus(editTrade.status || 'OPEN');
      setTradeThesis(editTrade.tradeThesis || '');
      const allocAccs = editTrade.allocations?.map((a) => a.accountId).filter(Boolean) || [];
      if (allocAccs.length > 0) {
        setSelectedAccountIds(allocAccs);
      }
    } else {
      setSymbol('XAUUSD');
      setDirection('BUY');
      setEntryPrice('');
      setStopLoss('');
      setTakeProfit('');
      setRiskPct('1.0');
      setStrategyId('');
      setSetupType('');
      setSession('London');
      setTimeframe('15M');
      setStatus('OPEN');
      setTradeThesis('');
      if (selectedAccountId !== 'ALL') {
        setSelectedAccountIds([selectedAccountId]);
      } else if (accounts.length > 0) {
        setSelectedAccountIds([accounts[0].id]);
      }
    }
  }, [isOpen, editTrade, selectedAccountId, accounts]);

  if (!isOpen) return null;

  // Real-time calculation preview
  const numEntry = parseFloat(entryPrice) || 0;
  const numSl = parseFloat(stopLoss) || 0;
  const numTp = parseFloat(takeProfit) || 0;
  const numRisk = parseFloat(riskPct) || 1.0;

  let calcPreview: ReturnType<typeof calculatePositionSize> | null = null;
  let calcError: string | null = null;

  try {
    if (numEntry > 0 && numSl > 0 && numEntry !== numSl) {
      const primaryAccount = accounts.find((a) => a.id === selectedAccountIds[0]) || accounts[0];
      calcPreview = calculatePositionSize({
        accountEquity: primaryAccount?.currentEquity || 100000,
        riskPercentage: numRisk,
        entryPrice: numEntry,
        stopLossPrice: numSl,
        takeProfitPrice: numTp > 0 ? numTp : undefined,
        instrument: activeInstrument,
      });
    }
  } catch (err: any) {
    calcError = err.message;
  }

  const allChecklistPassed = Object.values(checklist).every(Boolean);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!calcPreview || calcError || selectedAccountIds.length === 0) return;

    const allocations = selectedAccountIds.map((accId) => {
      const acc = accounts.find((a) => a.id === accId);
      const accSize = acc ? acc.currentEquity : 100000;
      const sizeCalc = calculatePositionSize({
        accountEquity: accSize,
        riskPercentage: numRisk,
        entryPrice: numEntry,
        stopLossPrice: numSl,
        takeProfitPrice: numTp > 0 ? numTp : undefined,
        instrument: activeInstrument,
      });

      return {
        id: `alloc-${Date.now()}-${accId}`,
        tradeId: '',
        accountId: accId,
        accountName: acc?.name,
        allocatedPositionSize: sizeCalc.positionSize,
        allocatedRiskUsd: sizeCalc.potentialLoss,
        allocatedRiskPct: numRisk,
        entryPrice: numEntry,
        stopLoss: numSl,
        takeProfit: numTp > 0 ? numTp : undefined,
        realizedPnl: 0,
        netPnl: 0,
        commission: activeInstrument.category === 'forex' ? 7 * sizeCalc.positionSize : 15,
        swap: 0,
        fees: 0,
        status,
        executions: [
          {
            id: `exec-${Date.now()}-${accId}`,
            tradeId: '',
            allocationId: `alloc-${Date.now()}-${accId}`,
            accountId: accId,
            executionType: 'ENTRY' as const,
            price: numEntry,
            size: sizeCalc.positionSize,
            commission: activeInstrument.category === 'forex' ? 7 * sizeCalc.positionSize : 15,
            swap: 0,
            realizedPnl: 0,
            executionTime: new Date().toISOString(),
            notes: 'Position Entry',
          },
        ],
      };
    });

    const totalRiskUsd = allocations.reduce((sum, a) => sum + a.allocatedRiskUsd, 0);

    if (editTrade) {
      updateTrade({
        ...editTrade,
        instrumentSymbol: symbol,
        strategyId: strategyId || undefined,
        strategyName: strategies.find((s) => s.id === strategyId)?.name || editTrade.strategyName,
        direction,
        status: editTrade.status === 'CLOSED' ? 'CLOSED' : status,
        timeframe,
        session,
        setupType: setupType || editTrade.setupType,
        entryPrice: numEntry,
        stopLoss: numSl,
        takeProfit: numTp > 0 ? numTp : undefined,
        plannedRiskUsd: totalRiskUsd > 0 ? totalRiskUsd : editTrade.plannedRiskUsd,
        plannedRiskPct: numRisk,
        plannedRr: calcPreview?.plannedRr || editTrade.plannedRr,
        tradeThesis,
        isRuleCompliant: allChecklistPassed,
        updatedAt: new Date().toISOString(),
      });
    } else {
      addTrade({
        instrumentSymbol: symbol,
        strategyId: strategyId || undefined,
        direction,
        status,
        timeframe,
        session,
        setupType,
        entryPrice: numEntry,
        stopLoss: numSl,
        takeProfit: numTp > 0 ? numTp : undefined,
        plannedRiskUsd: totalRiskUsd,
        plannedRiskPct: numRisk,
        plannedRr: calcPreview?.plannedRr || 2.0,
        tradeThesis,
        isRuleCompliant: allChecklistPassed,
        allocations,
        tags: [symbol, session, setupType].filter(Boolean),
      });
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-lg border border-edge-border bg-edge-surface shadow-terminal text-xs">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-edge-border bg-edge-surface-secondary/50">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded bg-edge-accent" />
            <h2 className="font-mono text-sm font-bold tracking-wider text-white uppercase">
              {editTrade ? `EDIT EXECUTION · ${editTrade.instrumentSymbol}` : 'RECORD NEW EXECUTION'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-edge-text-secondary hover:text-white p-1 rounded hover:bg-edge-surface-secondary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Top row: Symbol, Direction, Status */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-mono text-[11px] text-edge-text-secondary uppercase mb-1">
                Instrument
              </label>
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="w-full px-3 py-2 rounded bg-edge-surface-secondary border border-edge-border text-white font-mono focus:border-edge-accent outline-none"
              >
                {instruments.map((i) => (
                  <option key={i.symbol} value={i.symbol}>
                    {i.symbol} ({i.name})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-mono text-[11px] text-edge-text-secondary uppercase mb-1">
                Direction
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDirection('BUY')}
                  className={`py-2 rounded font-mono font-bold flex items-center justify-center space-x-1 border transition-colors ${
                    direction === 'BUY'
                      ? 'bg-edge-profit/20 border-edge-profit text-edge-profit'
                      : 'border-edge-border text-edge-text-secondary hover:text-white'
                  }`}
                >
                  <ArrowUpRight size={14} />
                  <span>BUY / LONG</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDirection('SELL')}
                  className={`py-2 rounded font-mono font-bold flex items-center justify-center space-x-1 border transition-colors ${
                    direction === 'SELL'
                      ? 'bg-edge-loss/20 border-edge-loss text-edge-loss'
                      : 'border-edge-border text-edge-text-secondary hover:text-white'
                  }`}
                >
                  <ArrowDownRight size={14} />
                  <span>SELL / SHORT</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block font-mono text-[11px] text-edge-text-secondary uppercase mb-1">
                Execution Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TradeStatus)}
                className="w-full px-3 py-2 rounded bg-edge-surface-secondary border border-edge-border text-white font-mono focus:border-edge-accent outline-none"
              >
                <option value="OPEN">OPEN (Active Position)</option>
                <option value="CLOSED">CLOSED (Completed Trade)</option>
                <option value="PLANNED">PLANNED (Order Limit / Setup)</option>
              </select>
            </div>
          </div>

          {/* Pricing Row: Entry, SL, TP, Risk % */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-edge-surface-secondary/40 p-3 rounded border border-edge-border/60">
            <div>
              <label className="block font-mono text-[10px] text-edge-text-muted uppercase mb-1">
                Entry Price
              </label>
              <input
                type="number"
                step="any"
                value={entryPrice}
                onChange={(e) => setEntryPrice(e.target.value)}
                placeholder="0.00"
                className="w-full px-2.5 py-1.5 rounded bg-edge-surface border border-edge-border text-white font-mono focus:border-edge-accent outline-none tabular-nums"
                required
              />
            </div>

            <div>
              <label className="block font-mono text-[10px] text-edge-loss uppercase mb-1">
                Stop Loss
              </label>
              <input
                type="number"
                step="any"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                placeholder="0.00"
                className="w-full px-2.5 py-1.5 rounded bg-edge-surface border border-edge-loss/50 text-edge-loss font-mono focus:border-edge-loss outline-none tabular-nums"
                required
              />
            </div>

            <div>
              <label className="block font-mono text-[10px] text-edge-profit uppercase mb-1">
                Take Profit
              </label>
              <input
                type="number"
                step="any"
                value={takeProfit}
                onChange={(e) => setTakeProfit(e.target.value)}
                placeholder="0.00 (optional)"
                className="w-full px-2.5 py-1.5 rounded bg-edge-surface border border-edge-profit/50 text-edge-profit font-mono focus:border-edge-profit outline-none tabular-nums"
              />
            </div>

            <div>
              <label className="block font-mono text-[10px] text-edge-accent uppercase mb-1">
                Risk %
              </label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                max="10"
                value={riskPct}
                onChange={(e) => setRiskPct(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded bg-edge-surface border border-edge-accent/50 text-edge-accent font-mono focus:border-edge-accent outline-none tabular-nums"
                required
              />
            </div>
          </div>

          {/* Account Allocation Selector */}
          <div>
            <label className="block font-mono text-[11px] text-edge-text-secondary uppercase mb-1">
              Allocate Across Accounts
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {accounts.map((acc) => {
                const isSelected = selectedAccountIds.includes(acc.id);
                return (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        if (selectedAccountIds.length > 1) {
                          setSelectedAccountIds(selectedAccountIds.filter((id) => id !== acc.id));
                        }
                      } else {
                        setSelectedAccountIds([...selectedAccountIds, acc.id]);
                      }
                    }}
                    className={`p-2.5 rounded border text-left flex justify-between items-center transition-colors ${
                      isSelected
                        ? 'bg-edge-accent/15 border-edge-accent/60 text-white'
                        : 'bg-edge-surface-secondary/40 border-edge-border text-edge-text-muted hover:text-edge-text-secondary'
                    }`}
                  >
                    <div>
                      <div className="font-semibold truncate max-w-[140px]">{acc.name}</div>
                      <div className="text-[10px] text-edge-text-muted font-mono">
                        Eq: ${acc.currentEquity.toLocaleString('en-US')}
                      </div>
                    </div>
                    {isSelected ? (
                      <CheckSquare size={16} className="text-edge-accent shrink-0" />
                    ) : (
                      <Square size={16} className="text-edge-text-muted shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Real-time Calculation Card */}
          {calcPreview && (
            <div className="p-3 rounded border border-edge-accent/30 bg-edge-accent/5 flex flex-wrap items-center justify-between gap-4 font-mono">
              <div className="flex items-center space-x-2 text-edge-accent font-semibold">
                <Calculator size={15} />
                <span>POSITION CALCULATION</span>
              </div>
              <div className="flex items-center space-x-6 text-[11px]">
                <div>
                  <span className="text-edge-text-muted mr-1.5">Lot Size:</span>
                  <span className="text-white font-bold">{calcPreview.positionSize} Lots</span>
                </div>
                <div>
                  <span className="text-edge-text-muted mr-1.5">Monetary Risk:</span>
                  <span className="text-edge-loss font-bold">-${calcPreview.potentialLoss.toLocaleString('en-US')}</span>
                </div>
                <div>
                  <span className="text-edge-text-muted mr-1.5">Potential Reward:</span>
                  <span className="text-edge-profit font-bold">
                    +${(calcPreview.potentialProfit || 0).toLocaleString('en-US')}
                  </span>
                </div>
                <div>
                  <span className="text-edge-text-muted mr-1.5">Planned R:R:</span>
                  <span className="text-edge-accent font-bold">1:{calcPreview.plannedRr || 0}</span>
                </div>
              </div>
            </div>
          )}

          {calcError && (
            <div className="p-2.5 rounded bg-edge-loss/15 border border-edge-loss/40 text-edge-loss flex items-center space-x-2 font-mono">
              <AlertCircle size={15} />
              <span>{calcError}</span>
            </div>
          )}

          {/* Strategy, Setup, Session, Timeframe */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block font-mono text-[10px] text-edge-text-muted uppercase mb-1">
                Strategy
              </label>
              <select
                value={strategyId}
                onChange={(e) => setStrategyId(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded bg-edge-surface-secondary border border-edge-border text-white font-mono focus:border-edge-accent outline-none"
              >
                <option value="">No Strategy Linked</option>
                {strategies.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-mono text-[10px] text-edge-text-muted uppercase mb-1">
                Setup Type
              </label>
              <input
                type="text"
                value={setupType}
                onChange={(e) => setSetupType(e.target.value)}
                placeholder="e.g. Liquidity Sweep"
                className="w-full px-2.5 py-1.5 rounded bg-edge-surface-secondary border border-edge-border text-white font-mono focus:border-edge-accent outline-none"
              />
            </div>

            <div>
              <label className="block font-mono text-[10px] text-edge-text-muted uppercase mb-1">
                Session
              </label>
              <select
                value={session}
                onChange={(e) => setSession(e.target.value as any)}
                className="w-full px-2.5 py-1.5 rounded bg-edge-surface-secondary border border-edge-border text-white font-mono focus:border-edge-accent outline-none"
              >
                <option value="London">London (08:00 UTC)</option>
                <option value="New York">New York (13:30 UTC)</option>
                <option value="London Close">London Close (15:30 UTC)</option>
                <option value="Asian">Asian (00:00 UTC)</option>
                <option value="Sydney">Sydney (21:00 UTC)</option>
              </select>
            </div>

            <div>
              <label className="block font-mono text-[10px] text-edge-text-muted uppercase mb-1">
                Timeframe
              </label>
              <select
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded bg-edge-surface-secondary border border-edge-border text-white font-mono focus:border-edge-accent outline-none"
              >
                <option value="1M">1 Minute</option>
                <option value="5M">5 Minutes</option>
                <option value="15M">15 Minutes</option>
                <option value="1H">1 Hour</option>
                <option value="4H">4 Hours</option>
                <option value="D1">Daily</option>
              </select>
            </div>
          </div>

          {/* Pre-trade Checklist */}
          <div className="p-3 rounded border border-edge-border bg-edge-surface-secondary/30 space-y-2">
            <span className="block font-mono text-[10px] text-edge-text-muted uppercase font-bold tracking-wider">
              Pre-Trade Execution Checklist
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checklist.biasConfirmed}
                  onChange={(e) => setChecklist({ ...checklist, biasConfirmed: e.target.checked })}
                  className="rounded border-edge-border text-edge-accent focus:ring-0"
                />
                <span className="text-[11px] text-edge-text-secondary">HTF Bias Aligned</span>
              </label>

              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checklist.validTrigger}
                  onChange={(e) => setChecklist({ ...checklist, validTrigger: e.target.checked })}
                  className="rounded border-edge-border text-edge-accent focus:ring-0"
                />
                <span className="text-[11px] text-edge-text-secondary">Valid Setup Trigger</span>
              </label>

              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checklist.slTechnical}
                  onChange={(e) => setChecklist({ ...checklist, slTechnical: e.target.checked })}
                  className="rounded border-edge-border text-edge-accent focus:ring-0"
                />
                <span className="text-[11px] text-edge-text-secondary">Technical Invalidation SL</span>
              </label>

              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checklist.riskWithinLimits}
                  onChange={(e) => setChecklist({ ...checklist, riskWithinLimits: e.target.checked })}
                  className="rounded border-edge-border text-edge-accent focus:ring-0"
                />
                <span className="text-[11px] text-edge-text-secondary">Risk &lt; Account Limit</span>
              </label>

              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checklist.noRedFolderNews}
                  onChange={(e) => setChecklist({ ...checklist, noRedFolderNews: e.target.checked })}
                  className="rounded border-edge-border text-edge-accent focus:ring-0"
                />
                <span className="text-[11px] text-edge-text-secondary">No High-Impact News</span>
              </label>

              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checklist.noFomo}
                  onChange={(e) => setChecklist({ ...checklist, noFomo: e.target.checked })}
                  className="rounded border-edge-border text-edge-accent focus:ring-0"
                />
                <span className="text-[11px] text-edge-text-secondary">Zero FOMO / Impatience</span>
              </label>
            </div>
          </div>

          {/* Thesis / Notes */}
          <div>
            <label className="block font-mono text-[10px] text-edge-text-muted uppercase mb-1">
              Trade Thesis & Technical Bias
            </label>
            <textarea
              rows={2}
              value={tradeThesis}
              onChange={(e) => setTradeThesis(e.target.value)}
              placeholder="Reasoning, confluence, key price level, market structure..."
              className="w-full px-3 py-2 rounded bg-edge-surface-secondary border border-edge-border text-white text-xs outline-none focus:border-edge-accent"
            />
          </div>

          {/* Footer Submit */}
          <div className="flex justify-end space-x-3 pt-2 border-t border-edge-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded text-edge-text-secondary hover:text-white font-mono transition-colors"
            >
              CANCEL
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded bg-edge-accent text-edge-bg font-mono font-bold tracking-wider hover:bg-edge-accent-light transition-colors shadow-subtle"
            >
              {editTrade ? 'SAVE EXECUTION CHANGES' : 'RECORD EXECUTION'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
