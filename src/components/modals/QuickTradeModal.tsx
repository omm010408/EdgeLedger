'use client';

import React, { useState, useEffect } from 'react';
import { useTrading } from '../../context/TradingContext';
import {
  calculatePositionSize,
  calculateMetricsForFixedSize,
  calculateExecutionPnl,
  getDefaultCommission,
} from '../../lib/calculations/financialEngine';
import { Trade, TradeDirection, TradeStatus } from '../../lib/types/financial';
import { X, CheckSquare, Square, Calculator, AlertCircle, ArrowUpRight, ArrowDownRight, Calendar } from 'lucide-react';

interface QuickTradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  editTrade?: Trade | null;
  defaultDate?: string;
}

function getLocalTodayDateStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getLocalClockStr(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getIsoDatePart(iso?: string): string {
  if (!iso) return getLocalTodayDateStr();
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return getLocalTodayDateStr();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getIsoTimePart(iso?: string): string {
  if (!iso) return getLocalClockStr();
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return getLocalClockStr();
  return getLocalClockStr(d);
}

function combineDateAndTime(dateStr: string, timeStr: string): string {
  const safeDate = dateStr || getLocalTodayDateStr();
  const safeTime = timeStr || '09:00';
  const d = new Date(`${safeDate}T${safeTime}:00`);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export const QuickTradeModal: React.FC<QuickTradeModalProps> = ({
  isOpen,
  onClose,
  editTrade = null,
  defaultDate,
}) => {
  const { accounts, selectedAccountId, instruments, strategies, addTrade, updateTrade } = useTrading();

  // Form State - Clean blank defaults with informative placeholders
  const [symbol, setSymbol] = useState('XAUUSD');
  const [direction, setDirection] = useState<TradeDirection>('BUY');
  const [entryPrice, setEntryPrice] = useState<string>('');
  const [stopLoss, setStopLoss] = useState<string>('');
  const [takeProfit, setTakeProfit] = useState<string>('');
  const [exitPrice, setExitPrice] = useState<string>('');
  const [realizedNetInput, setRealizedNetInput] = useState<string>('');
  const [isManualNetOverride, setIsManualNetOverride] = useState<boolean>(false);
  const [realizedRInput, setRealizedRInput] = useState<string>('');
  const [isManualROverride, setIsManualROverride] = useState<boolean>(false);
  const [riskPct, setRiskPct] = useState<string>('1.0');
  const [customPositionSize, setCustomPositionSize] = useState<string>('');
  const [commissionInput, setCommissionInput] = useState<string>('');
  const [tradeDate, setTradeDate] = useState<string>(() => defaultDate || getLocalTodayDateStr());
  const [entryClock, setEntryClock] = useState<string>(() => getLocalClockStr());
  const [exitDate, setExitDate] = useState<string>(() => defaultDate || getLocalTodayDateStr());
  const [exitClock, setExitClock] = useState<string>(() => getLocalClockStr());
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
      const existingExit = editTrade.allocations?.find((a) => a.exitPrice)?.exitPrice;
      setExitPrice(existingExit ? String(existingExit) : '');
      const firstAllocSize = editTrade.allocations?.[0]?.allocatedPositionSize || 1;
      const editCommVal = Number.isFinite(editTrade.totalCommission)
        ? editTrade.totalCommission
        : getDefaultCommission(
            instruments.find((i) => i.symbol === editTrade.instrumentSymbol) || instruments[0],
            firstAllocSize
          );
      setCustomPositionSize(firstAllocSize ? String(firstAllocSize) : '');
      setCommissionInput(Number.isFinite(editTrade.totalCommission) ? String(editTrade.totalCommission) : '');
      if (editTrade.status === 'CLOSED' && Number.isFinite(editTrade.netPnl)) {
        const editInst = instruments.find((i) => i.symbol === editTrade.instrumentSymbol) || instruments[0];
        const expectedAuto =
          existingExit && existingExit > 0
            ? calculateExecutionPnl(
                editTrade.direction,
                editTrade.entryPrice,
                existingExit,
                firstAllocSize,
                editInst,
                editCommVal,
                0
              ).netPnl
            : null;
        if (expectedAuto !== null && Math.abs(expectedAuto - editTrade.netPnl) <= 0.25) {
          setIsManualNetOverride(false);
          setRealizedNetInput('');
        } else {
          setIsManualNetOverride(true);
          setRealizedNetInput(String(editTrade.netPnl));
        }
        if (editTrade.realizedR !== undefined && editTrade.realizedR !== null) {
          setRealizedRInput(String(editTrade.realizedR));
          setIsManualROverride(true);
        } else {
          setRealizedRInput('');
          setIsManualROverride(false);
        }
      } else {
        setIsManualNetOverride(false);
        setRealizedNetInput('');
        setRealizedRInput('');
        setIsManualROverride(false);
      }
      setRiskPct(editTrade.plannedRiskPct ? String(editTrade.plannedRiskPct) : '1.0');
      const entryIso = editTrade.entryTime || editTrade.createdAt;
      setTradeDate(getIsoDatePart(entryIso));
      setEntryClock(getIsoTimePart(entryIso));
      const exitIso = editTrade.exitTime || entryIso;
      setExitDate(getIsoDatePart(exitIso));
      setExitClock(getIsoTimePart(exitIso));
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
      setExitPrice('');
      setRealizedNetInput('');
      setIsManualNetOverride(false);
      setRealizedRInput('');
      setIsManualROverride(false);
      setRiskPct('1.0');
      setCustomPositionSize('');
      setCommissionInput('');
      const todayOrDefault = defaultDate || getLocalTodayDateStr();
      const nowClock = getLocalClockStr();
      setTradeDate(todayOrDefault);
      setEntryClock(defaultDate ? '09:00' : nowClock);
      setExitDate(todayOrDefault);
      setExitClock(defaultDate ? '11:30' : nowClock);
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
  }, [isOpen, editTrade, defaultDate, selectedAccountId, accounts]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Real-time calculation preview
  const numEntry = parseFloat(entryPrice) || 0;
  const numSl = parseFloat(stopLoss) || 0;
  const numTp = parseFloat(takeProfit) || 0;
  const numExit = parseFloat(exitPrice) || 0;
  const numRisk = parseFloat(riskPct) || 1.0;
  const explicitLots =
    customPositionSize.trim() !== '' &&
    Number.isFinite(parseFloat(customPositionSize)) &&
    parseFloat(customPositionSize) > 0
      ? parseFloat(customPositionSize)
      : null;
  const explicitCommTotal =
    commissionInput.trim() !== '' &&
    Number.isFinite(parseFloat(commissionInput)) &&
    parseFloat(commissionInput) >= 0
      ? parseFloat(commissionInput)
      : null;

  let calcPreview: ReturnType<typeof calculatePositionSize> | null = null;
  let calcError: string | null = null;
  let directionWarning: string | null = null;

  if (numEntry > 0 && numSl > 0 && numEntry !== numSl) {
    if (direction === 'BUY' && numSl >= numEntry) {
      directionWarning = 'Stop Loss is at or above Entry Price for a BUY trade.';
    } else if (direction === 'SELL' && numSl <= numEntry) {
      directionWarning = 'Stop Loss is at or below Entry Price for a SELL trade.';
    } else if (numTp > 0) {
      if (direction === 'BUY' && numTp <= numEntry) {
        directionWarning = 'Take Profit is below Entry Price for a BUY trade.';
      } else if (direction === 'SELL' && numTp >= numEntry) {
        directionWarning = 'Take Profit is above Entry Price for a SELL trade.';
      }
    }
  }

  const targetPreviewIds =
    selectedAccountIds.length > 0
      ? selectedAccountIds
      : accounts.length > 0
        ? [accounts[0].id]
        : ['unassigned'];

  try {
    if (numEntry > 0) {
      const primaryAccount = accounts.find((a) => a.id === targetPreviewIds[0]) || accounts[0];
      const eq = primaryAccount?.currentEquity || 100000;
      const existingPlannedRisk = editTrade?.plannedRiskUsd;
      if (explicitLots !== null) {
        calcPreview = calculateMetricsForFixedSize({
          accountEquity: eq,
          positionSize: explicitLots,
          entryPrice: numEntry,
          stopLossPrice: numSl,
          takeProfitPrice: numTp > 0 ? numTp : undefined,
          direction,
          instrument: activeInstrument,
          plannedRiskUsd: existingPlannedRisk,
          riskPercentage: numRisk,
        });
      } else if (numSl > 0 && numEntry !== numSl) {
        const riskSized = calculatePositionSize({
          accountEquity: eq,
          riskPercentage: numRisk,
          entryPrice: numEntry,
          stopLossPrice: numSl,
          takeProfitPrice: numTp > 0 ? numTp : undefined,
          instrument: activeInstrument,
        });
        calcPreview = calculateMetricsForFixedSize({
          accountEquity: eq,
          positionSize: riskSized.positionSize,
          entryPrice: numEntry,
          stopLossPrice: numSl,
          takeProfitPrice: numTp > 0 ? numTp : undefined,
          direction,
          instrument: activeInstrument,
          plannedRiskUsd: existingPlannedRisk,
          riskPercentage: numRisk,
        });
      } else {
        calcPreview = calculateMetricsForFixedSize({
          accountEquity: eq,
          positionSize: 1.0,
          entryPrice: numEntry,
          stopLossPrice: 0,
          takeProfitPrice: numTp > 0 ? numTp : undefined,
          direction,
          instrument: activeInstrument,
          plannedRiskUsd: existingPlannedRisk,
          riskPercentage: numRisk,
        });
      }
    }
  } catch (err: any) {
    calcError = err.message;
  }

  const previewAutoCommission = calcPreview
    ? getDefaultCommission(activeInstrument, calcPreview.positionSize)
    : 0;
  const previewPerAccountCommission =
    explicitCommTotal !== null
      ? Math.round((explicitCommTotal / targetPreviewIds.length) * 100) / 100
      : previewAutoCommission;

  const manualNetNum =
    isManualNetOverride && realizedNetInput.trim() !== '' && Number.isFinite(Number(realizedNetInput))
      ? Number(realizedNetInput)
      : null;

  let closedCalcPreview: { gross: number; commission: number; net: number; r: number } | null = null;
  if (status === 'CLOSED' && calcPreview) {
    const manualR =
      isManualROverride && realizedRInput.trim() !== '' && Number.isFinite(parseFloat(realizedRInput))
        ? parseFloat(realizedRInput)
        : null;

    if (manualNetNum !== null) {
      const totalCommPreview =
        explicitCommTotal !== null
          ? explicitCommTotal
          : Number((previewAutoCommission * targetPreviewIds.length).toFixed(2));
      const gross = Number((manualNetNum + totalCommPreview).toFixed(2));
      const autoR =
        calcPreview.potentialLoss > 0
          ? Number(((manualNetNum / targetPreviewIds.length) / calcPreview.potentialLoss).toFixed(2))
          : editTrade?.realizedR ?? 0;
      const r = manualR !== null ? manualR : autoR;
      closedCalcPreview = { gross, commission: totalCommPreview, net: manualNetNum, r };
    } else if (numExit > 0) {
      const pnlRes = calculateExecutionPnl(
        direction,
        numEntry,
        numExit,
        calcPreview.positionSize,
        activeInstrument,
        previewPerAccountCommission,
        0
      );
      const autoR =
        calcPreview.potentialLoss > 0
          ? Number((pnlRes.netPnl / calcPreview.potentialLoss).toFixed(2))
          : editTrade?.realizedR ?? 0;
      const r = manualR !== null ? manualR : autoR;
      closedCalcPreview = {
        gross: Number((pnlRes.grossPnl * targetPreviewIds.length).toFixed(2)),
        commission: Number((previewPerAccountCommission * targetPreviewIds.length).toFixed(2)),
        net: Number((pnlRes.netPnl * targetPreviewIds.length).toFixed(2)),
        r,
      };
    }
  }

  const allChecklistPassed = Object.values(checklist).every(Boolean);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!calcPreview || calcError) return;

    const targetAccountIds =
      selectedAccountIds.length > 0
        ? selectedAccountIds
        : accounts.length > 0
        ? [accounts[0].id]
        : ['unassigned'];

    const explicitNetOverride =
      isManualNetOverride &&
      realizedNetInput.trim() !== '' &&
      Number.isFinite(Number(realizedNetInput))
        ? Number(realizedNetInput)
        : null;

    const parsedEntryIso = combineDateAndTime(tradeDate, entryClock);
    const parsedExitIso =
      status === 'CLOSED'
        ? combineDateAndTime(exitDate || tradeDate, exitClock || entryClock)
        : undefined;

    const perAccountManualNet =
      explicitNetOverride !== null
        ? targetAccountIds.map((_, idx) => {
            const base = Math.round((explicitNetOverride / targetAccountIds.length) * 100) / 100;
            if (idx === 0) {
              const others = base * (targetAccountIds.length - 1);
              return Math.round((explicitNetOverride - others) * 100) / 100;
            }
            return base;
          })
        : null;

    const allocations = targetAccountIds.map((accId, accIdx) => {
      const acc = accounts.find((a) => a.id === accId);
      const existingAlloc = editTrade?.allocations?.find((a) => a.accountId === accId);
      const accSize = acc ? acc.currentEquity : 100000;
      const autoCalc = calculatePositionSize({
        accountEquity: accSize,
        riskPercentage: numRisk,
        entryPrice: numEntry,
        stopLossPrice: numSl,
        takeProfitPrice: numTp > 0 ? numTp : undefined,
        instrument: activeInstrument,
      });

      const effectivePositionSize = explicitLots !== null ? explicitLots : autoCalc.positionSize;
      const effectiveMetrics = calculateMetricsForFixedSize({
        accountEquity: accSize,
        positionSize: effectivePositionSize,
        entryPrice: numEntry,
        stopLossPrice: numSl,
        takeProfitPrice: numTp > 0 ? numTp : undefined,
        direction,
        instrument: activeInstrument,
        plannedRiskUsd: existingAlloc?.allocatedRiskUsd || editTrade?.plannedRiskUsd,
        riskPercentage: numRisk,
      });

      const commission =
        explicitCommTotal !== null
          ? Math.round((explicitCommTotal / targetAccountIds.length) * 100) / 100
          : getDefaultCommission(activeInstrument, effectivePositionSize);
      let allocGross = existingAlloc?.realizedPnl || 0;
      let allocNet = existingAlloc?.netPnl || 0;

      if (status === 'CLOSED') {
        if (perAccountManualNet !== null) {
          allocNet = perAccountManualNet[accIdx];
          allocGross = Math.round((allocNet + commission) * 100) / 100;
        } else if (numExit > 0) {
          const pnlRes = calculateExecutionPnl(
            direction,
            numEntry,
            numExit,
            effectivePositionSize,
            activeInstrument,
            commission,
            0
          );
          allocGross = pnlRes.grossPnl;
          allocNet = pnlRes.netPnl;
        }
      } else {
        allocGross = 0;
        allocNet = 0;
      }

      const allocId = existingAlloc?.id || `alloc-${Date.now()}-${accId}`;
      const existingExecs = existingAlloc?.executions || [
        {
          id: `exec-${Date.now()}-${accId}`,
          tradeId: editTrade?.id || '',
          allocationId: allocId,
          accountId: accId,
          executionType: 'ENTRY' as const,
          price: numEntry,
          size: effectivePositionSize,
          commission,
          swap: 0,
          realizedPnl: 0,
          executionTime: parsedEntryIso,
          notes: 'Position Entry',
        },
      ];

      return {
        id: allocId,
        tradeId: editTrade?.id || '',
        accountId: accId,
        accountName: acc?.name || existingAlloc?.accountName || 'Primary Desk',
        allocatedPositionSize: effectivePositionSize,
        allocatedRiskUsd: effectiveMetrics.potentialLoss,
        allocatedRiskPct: effectiveMetrics.riskPctOfEquity,
        entryPrice: numEntry,
        stopLoss: numSl,
        takeProfit: numTp > 0 ? numTp : undefined,
        exitPrice: numExit > 0 ? numExit : existingAlloc?.exitPrice,
        realizedPnl: allocGross,
        netPnl: allocNet,
        commission,
        swap: existingAlloc?.swap || 0,
        fees: existingAlloc?.fees || 0,
        status,
        executions: existingExecs,
      };
    });

    const explicitROverride =
      status === 'CLOSED' &&
      isManualROverride &&
      realizedRInput.trim() !== '' &&
      Number.isFinite(parseFloat(realizedRInput))
        ? parseFloat(realizedRInput)
        : null;

    const totalAllocatedRisk = allocations.reduce((sum, a) => sum + a.allocatedRiskUsd, 0);
    const totalRiskUsd =
      totalAllocatedRisk > 0
        ? totalAllocatedRisk
        : (editTrade?.plannedRiskUsd && editTrade.plannedRiskUsd > 0 ? editTrade.plannedRiskUsd : 0) ||
          (accounts[0]?.currentEquity || 100000) * ((parseFloat(riskPct) || 1.0) / 100);

    const totalGrossPnl = Math.round(allocations.reduce((sum, a) => sum + a.realizedPnl, 0) * 100) / 100;
    const totalCommission = Math.round(allocations.reduce((sum, a) => sum + a.commission, 0) * 100) / 100;
    const totalNetPnl =
      status === 'CLOSED' && explicitNetOverride !== null
        ? explicitNetOverride
        : Math.round(allocations.reduce((sum, a) => sum + a.netPnl, 0) * 100) / 100;

    const totalRealizedR =
      explicitROverride !== null
        ? explicitROverride
        : totalRiskUsd > 0
        ? Math.round((totalNetPnl / totalRiskUsd) * 100) / 100
        : (editTrade?.realizedR ?? 0);
    const effectivePlannedRiskPct = allocations[0]?.allocatedRiskPct || numRisk;

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
        plannedRiskUsd:
          numSl > 0 && totalAllocatedRisk > 0
            ? totalAllocatedRisk
            : (editTrade.plannedRiskUsd && editTrade.plannedRiskUsd > 0 ? editTrade.plannedRiskUsd : totalRiskUsd),
        plannedRiskPct: effectivePlannedRiskPct,
        plannedRr: calcPreview?.plannedRr ?? editTrade.plannedRr,
        realizedPnl: totalGrossPnl,
        netPnl: totalNetPnl,
        realizedR: totalRealizedR,
        totalCommission,
        entryTime: parsedEntryIso,
        exitTime: parsedExitIso,
        allocations,
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
        plannedRiskPct: effectivePlannedRiskPct,
        plannedRr: calcPreview?.plannedRr ?? 2.0,
        realizedPnl: totalGrossPnl,
        netPnl: totalNetPnl,
        realizedR: totalRealizedR,
        totalCommission,
        entryTime: parsedEntryIso,
        exitTime: parsedExitIso,
        tradeThesis,
        isRuleCompliant: allChecklistPassed,
        allocations,
        tags: [symbol, session, setupType].filter(Boolean),
      });
    }

    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
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
                disabled={editTrade?.status === 'CLOSED'}
                onChange={(e) => setStatus(e.target.value as TradeStatus)}
                className="w-full px-3 py-2 rounded bg-edge-surface-secondary border border-edge-border text-white font-mono focus:border-edge-accent outline-none disabled:opacity-70"
              >
                <option value="OPEN">OPEN (Active Position)</option>
                <option value="CLOSED">CLOSED (Completed Trade)</option>
                <option value="PLANNED">PLANNED (Order Limit / Setup)</option>
              </select>
            </div>
          </div>

          {/* Trade Date Section (Defaults to Today) */}
          <div className="bg-edge-surface-secondary/40 p-3 rounded border border-edge-border/60 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5 font-mono text-[10px] text-edge-text-secondary uppercase tracking-wider font-semibold">
                <Calendar size={12} className="text-edge-accent" />
                <span>Trade Date</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const today = getLocalTodayDateStr();
                  setTradeDate(today);
                  setExitDate(today);
                }}
                className="px-2 py-0.5 rounded bg-edge-accent/15 text-edge-accent border border-edge-accent/40 font-mono text-[10px] font-semibold hover:bg-edge-accent/25 transition-colors"
              >
                Today ({getLocalTodayDateStr()})
              </button>
            </div>

            <div className={`grid gap-3 ${status === 'CLOSED' ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2'}`}>
              <div>
                <label className="block font-mono text-[10px] text-edge-text-muted uppercase mb-1">
                  Entry Date
                </label>
                <input
                  type="date"
                  value={tradeDate}
                  onChange={(e) => {
                    setTradeDate(e.target.value);
                    if (!editTrade) setExitDate(e.target.value);
                  }}
                  className="w-full px-2.5 py-1.5 rounded bg-edge-surface border border-edge-border text-white font-mono text-[11px] focus:border-edge-accent outline-none"
                  required
                />
              </div>

              <div>
                <label className="block font-mono text-[10px] text-edge-text-muted uppercase mb-1">
                  Entry Time
                </label>
                <input
                  type="time"
                  value={entryClock}
                  onChange={(e) => setEntryClock(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded bg-edge-surface border border-edge-border text-white font-mono text-[11px] focus:border-edge-accent outline-none"
                />
              </div>

              {status === 'CLOSED' && (
                <>
                  <div>
                    <label className="block font-mono text-[10px] text-edge-text-muted uppercase mb-1">
                      Exit Date
                    </label>
                    <input
                      type="date"
                      value={exitDate}
                      onChange={(e) => setExitDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded bg-edge-surface border border-edge-border text-white font-mono text-[11px] focus:border-edge-accent outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-mono text-[10px] text-edge-text-muted uppercase mb-1">
                      Exit Time
                    </label>
                    <input
                      type="time"
                      value={exitClock}
                      onChange={(e) => setExitClock(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded bg-edge-surface border border-edge-border text-white font-mono text-[11px] focus:border-edge-accent outline-none"
                    />
                  </div>
                </>
              )}
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

          {/* Sizing & Commission */}
          <div className="grid grid-cols-2 gap-3 bg-edge-surface-secondary/40 p-3 rounded border border-edge-border/60">
            <div>
              <label className="block font-mono text-[10px] text-edge-text-muted uppercase mb-1">
                Position Size (Lots)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={customPositionSize}
                onChange={(e) => setCustomPositionSize(e.target.value)}
                placeholder={calcPreview ? `${calcPreview.positionSize} (auto)` : 'Auto'}
                className="w-full px-2.5 py-1.5 rounded bg-edge-surface border border-edge-border text-white font-mono focus:border-edge-accent outline-none tabular-nums"
              />
            </div>

            <div>
              <label className="block font-mono text-[10px] text-edge-text-muted uppercase mb-1">
                Commission ($)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={commissionInput}
                onChange={(e) => setCommissionInput(e.target.value)}
                placeholder={calcPreview ? `Auto ($${previewAutoCommission.toFixed(2)})` : 'Auto'}
                className="w-full px-2.5 py-1.5 rounded bg-edge-surface border border-edge-border text-white font-mono focus:border-edge-accent outline-none tabular-nums"
              />
            </div>
          </div>

          {status === 'CLOSED' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-edge-surface-secondary/40 p-3 rounded border border-edge-border/60">
              <div>
                <label className="block font-mono text-[10px] text-edge-text-muted uppercase mb-1">
                  Exit Price
                </label>
                <input
                  type="number"
                  step="any"
                  value={exitPrice}
                  onChange={(e) => setExitPrice(e.target.value)}
                  placeholder="Optional"
                  className="w-full px-2.5 py-1.5 rounded bg-edge-surface border border-edge-border text-white font-mono focus:border-edge-accent outline-none tabular-nums"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-mono text-[10px] text-edge-profit uppercase">
                    Realized Net P&amp;L ($)
                  </label>
                  {isManualNetOverride && numExit > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsManualNetOverride(false);
                        setRealizedNetInput('');
                      }}
                      className="text-[10px] font-mono text-edge-accent hover:underline"
                    >
                      Auto
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  step="any"
                  value={realizedNetInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setRealizedNetInput(val);
                    setIsManualNetOverride(val.trim() !== '');
                  }}
                  placeholder={
                    !isManualNetOverride && numExit > 0 && closedCalcPreview
                      ? `Auto: ${closedCalcPreview.net >= 0 ? '+' : '-'}$${Math.abs(closedCalcPreview.net).toFixed(2)}`
                      : 'Auto from exit, or enter $'
                  }
                  className="w-full px-2.5 py-1.5 rounded bg-edge-surface border border-edge-border text-white font-mono focus:border-edge-accent outline-none tabular-nums"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-mono text-[10px] text-edge-accent uppercase">
                    Realized R-Multiple
                  </label>
                  {isManualROverride && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsManualROverride(false);
                        setRealizedRInput('');
                      }}
                      className="text-[10px] font-mono text-edge-accent hover:underline"
                    >
                      Auto
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  step="0.01"
                  value={realizedRInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setRealizedRInput(val);
                    setIsManualROverride(val.trim() !== '');
                  }}
                  placeholder={
                    !isManualROverride && closedCalcPreview
                      ? `Auto: ${closedCalcPreview.r >= 0 ? '+' : ''}${closedCalcPreview.r.toFixed(2)}R`
                      : 'e.g. +2.00 or -1.00'
                  }
                  className="w-full px-2.5 py-1.5 rounded bg-edge-surface border border-edge-border text-white font-mono focus:border-edge-accent outline-none tabular-nums"
                />
              </div>
            </div>
          )}

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
            <div className="p-3 rounded border border-edge-accent/30 bg-edge-accent/5 space-y-2 font-mono">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center space-x-2 text-edge-accent font-semibold">
                  <Calculator size={15} />
                  <span>POSITION CALCULATION</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px]">
                  <div>
                    <span className="text-edge-text-muted mr-1.5">Lot Size:</span>
                    <span className="text-white font-bold">{calcPreview.positionSize} Lots</span>
                  </div>
                  <div>
                    <span className="text-edge-text-muted mr-1.5">Monetary Risk:</span>
                    <span className="text-edge-loss font-bold">
                      -${calcPreview.potentialLoss.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({calcPreview.riskPctOfEquity}%)
                    </span>
                  </div>
                  <div>
                    <span className="text-edge-text-muted mr-1.5">Potential Reward:</span>
                    <span className={`font-bold ${(calcPreview.potentialProfit || 0) < 0 ? 'text-edge-loss' : 'text-edge-profit'}`}>
                      {(calcPreview.potentialProfit || 0) < 0 ? '-' : '+'}$
                      {Math.abs(calcPreview.potentialProfit || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div>
                    <span className="text-edge-text-muted mr-1.5">Planned R:R:</span>
                    <span className="text-edge-accent font-bold">1:{calcPreview.plannedRr ?? 0}</span>
                  </div>
                </div>
              </div>

              {closedCalcPreview && (
                <div className="pt-2 border-t border-edge-border/50 flex flex-wrap items-center justify-between gap-3 text-[11px]">
                  <span className="text-edge-text-secondary uppercase tracking-wider font-semibold">
                    {isManualNetOverride ? 'Manual Net Result' : 'Calculated Closed Result'}
                  </span>
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                    <div>
                      <span className="text-edge-text-muted mr-1.5">Gross:</span>
                      <span className={closedCalcPreview.gross >= 0 ? 'text-edge-profit font-bold' : 'text-edge-loss font-bold'}>
                        {closedCalcPreview.gross >= 0 ? '+' : '-'}${Math.abs(closedCalcPreview.gross).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div>
                      <span className="text-edge-text-muted mr-1.5">Comm:</span>
                      <span className="text-edge-text-secondary font-semibold">
                        -${closedCalcPreview.commission.toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className="text-edge-text-muted mr-1.5">Net P&amp;L:</span>
                      <span className={closedCalcPreview.net >= 0 ? 'text-edge-profit font-bold' : 'text-edge-loss font-bold'}>
                        {closedCalcPreview.net >= 0 ? '+' : '-'}${Math.abs(closedCalcPreview.net).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div>
                      <span className="text-edge-text-muted mr-1.5">Realized R:</span>
                      <span className={closedCalcPreview.r >= 0 ? 'text-edge-profit font-bold' : 'text-edge-loss font-bold'}>
                        {closedCalcPreview.r >= 0 ? '+' : '-'}{Math.abs(closedCalcPreview.r).toFixed(2)}R
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {directionWarning && (
            <div className="p-2.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300 flex items-center space-x-2 font-mono">
              <AlertCircle size={15} />
              <span>{directionWarning}</span>
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
