'use client';

import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useTrading } from '../../context/TradingContext';
import {
  calculateExecutionPnl,
  calculateMetricsForFixedSize,
  calculatePositionSize,
  getDefaultCommission,
} from '../../lib/calculations/financialEngine';
import { Trade, TradeDirection, TradeStatus } from '../../lib/types/financial';

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

function formatMoney(v: number, signed = false): string {
  const abs = Math.abs(v).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (v < 0) return `−$${abs}`;
  if (signed && v > 0) return `+$${abs}`;
  return `$${abs}`;
}

export const QuickTradeModal: React.FC<QuickTradeModalProps> = ({
  isOpen,
  onClose,
  editTrade = null,
  defaultDate,
}) => {
  const {
    accounts,
    selectedAccountId,
    instruments,
    strategies,
    isPnlHidden,
    addTrade,
    updateTrade,
  } = useTrading();

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
  const [isDirty, setIsDirty] = useState<boolean>(false);

  const [checklist, setChecklist] = useState({
    biasConfirmed: false,
    validTrigger: false,
    slTechnical: false,
    riskWithinLimits: true,
    noRedFolderNews: true,
    noFomo: true,
  });

  const activeInstrument = instruments.find((i) => i.symbol === symbol) || instruments[0];

  useEffect(() => {
    if (!isOpen) return;
    setIsDirty(false);
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
      setTradeThesis((editTrade.tradeThesis || '').slice(0, 600));
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
      setChecklist({
        biasConfirmed: false,
        validTrigger: false,
        slTechnical: false,
        riskWithinLimits: true,
        noRedFolderNews: true,
        noFomo: true,
      });
      if (selectedAccountId !== 'ALL') {
        setSelectedAccountIds([selectedAccountId]);
      } else if (accounts.length > 0) {
        setSelectedAccountIds([accounts[0].id]);
      }
    }
  }, [isOpen, editTrade, defaultDate, selectedAccountId, accounts, instruments]);

  const handleSafeClose = React.useCallback(() => {
    if (isDirty && typeof window !== 'undefined') {
      if (!window.confirm('Discard this execution? Nothing has been saved.')) {
        return;
      }
    }
    setIsDirty(false);
    onClose();
  }, [isDirty, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleSafeClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, handleSafeClose]);

  useEffect(() => {
    if (!isOpen || !isDirty) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isOpen, isDirty]);

  if (!isOpen) return null;

  const parsedEntry = entryPrice.trim() !== '' ? parseFloat(entryPrice) : NaN;
  const parsedSl = stopLoss.trim() !== '' ? parseFloat(stopLoss) : NaN;
  const parsedTp = takeProfit.trim() !== '' ? parseFloat(takeProfit) : NaN;
  const parsedRisk = riskPct.trim() !== '' ? parseFloat(riskPct) : NaN;

  const numEntry = Number.isFinite(parsedEntry) ? parsedEntry : 0;
  const numSl = Number.isFinite(parsedSl) ? parsedSl : 0;
  const numTp = Number.isFinite(parsedTp) ? parsedTp : 0;
  const numExit = parseFloat(exitPrice) || 0;
  const numRisk = Number.isFinite(parsedRisk) ? parsedRisk : 0;

  // Field-level inline validation matching AddTrade.html rules
  let entryHint = '';
  let entryInvalid = false;
  if (entryPrice.trim() !== '' && (!Number.isFinite(parsedEntry) || parsedEntry <= 0)) {
    entryHint = 'Entry must be above zero';
    entryInvalid = true;
  }

  let stopHint = '';
  let stopInvalid = false;
  if (numEntry > 0 && stopLoss.trim() !== '' && numSl > 0) {
    if (direction === 'BUY' && numSl >= numEntry) {
      stopHint = 'For a buy, the stop must be below entry';
      stopInvalid = true;
    } else if (direction === 'SELL' && numSl <= numEntry) {
      stopHint = 'For a sell, the stop must be above entry';
      stopInvalid = true;
    }
  }

  let tpHint = '';
  let tpInvalid = false;
  if (numEntry > 0 && takeProfit.trim() !== '' && numTp > 0) {
    if (direction === 'BUY' && numTp <= numEntry) {
      tpHint = 'For a buy, the target must be above entry';
      tpInvalid = true;
    } else if (direction === 'SELL' && numTp >= numEntry) {
      tpHint = 'For a sell, the target must be below entry';
      tpInvalid = true;
    }
  }

  let riskHint = 'Share of account equity';
  let riskTone: '' | 'err' | 'warn' = '';
  let riskInvalid = false;
  if (!Number.isFinite(parsedRisk) || parsedRisk <= 0) {
    riskHint = 'Enter a risk above 0%';
    riskTone = 'err';
    riskInvalid = true;
  } else if (parsedRisk > 2) {
    riskHint = 'Above 2% of equity. Check the account limit.';
    riskTone = 'warn';
  }

  const levelsValid = !entryInvalid && !stopInvalid && !tpInvalid && !riskInvalid;

  const explicitLots =
    customPositionSize.trim() !== '' &&
    Number.isFinite(parseFloat(customPositionSize)) &&
    parseFloat(customPositionSize) >= 0.01
      ? parseFloat(customPositionSize)
      : null;
  const explicitCommTotal =
    commissionInput.trim() !== '' &&
    Number.isFinite(parseFloat(commissionInput)) &&
    parseFloat(commissionInput) >= 0
      ? parseFloat(commissionInput)
      : null;

  const primaryAccount =
    accounts.find((a) => a.id === selectedAccountIds[0]) || accounts[0];
  const primaryEquity = primaryAccount?.currentEquity || 100000;
  const riskAmountPreview = (primaryEquity * Math.max(0, numRisk)) / 100;

  let calcPreview: ReturnType<typeof calculatePositionSize> | null = null;
  let calcError: string | null = null;

  try {
    if (numEntry > 0) {
      const existingPlannedRisk = editTrade?.plannedRiskUsd;
      if (explicitLots !== null) {
        calcPreview = calculateMetricsForFixedSize({
          accountEquity: primaryEquity,
          positionSize: explicitLots,
          entryPrice: numEntry,
          stopLossPrice: numSl,
          takeProfitPrice: numTp > 0 ? numTp : undefined,
          direction,
          instrument: activeInstrument,
          plannedRiskUsd: existingPlannedRisk,
          riskPercentage: Math.max(0.1, numRisk),
        });
      } else if (numSl > 0 && numEntry !== numSl && numRisk > 0) {
        const riskSized = calculatePositionSize({
          accountEquity: primaryEquity,
          riskPercentage: numRisk,
          entryPrice: numEntry,
          stopLossPrice: numSl,
          takeProfitPrice: numTp > 0 ? numTp : undefined,
          instrument: activeInstrument,
        });
        calcPreview = calculateMetricsForFixedSize({
          accountEquity: primaryEquity,
          positionSize: riskSized.positionSize,
          entryPrice: numEntry,
          stopLossPrice: numSl,
          takeProfitPrice: numTp > 0 ? numTp : undefined,
          direction,
          instrument: activeInstrument,
          plannedRiskUsd: existingPlannedRisk,
          riskPercentage: numRisk,
        });
      }
    }
  } catch (err: unknown) {
    calcError = err instanceof Error ? err.message : 'Calculation error';
  }

  const riskPerUnit = numEntry > 0 && numSl > 0 ? Math.abs(numEntry - numSl) : null;
  const rawLotsPreview =
    riskPerUnit && riskPerUnit > 0 && activeInstrument?.contractSize
      ? Math.floor((riskAmountPreview / (riskPerUnit * activeInstrument.contractSize)) * 100) / 100
      : 0;
  const effectiveLotsPreview = explicitLots !== null ? explicitLots : calcPreview?.positionSize ?? rawLotsPreview;
  const sizeOk =
    levelsValid &&
    numEntry > 0 &&
    (explicitLots !== null || (numSl > 0 && effectiveLotsPreview >= 0.01));

  const plannedRrPreview =
    numEntry > 0 &&
    numSl > 0 &&
    riskPerUnit &&
    riskPerUnit > 0 &&
    numTp > 0 &&
    !tpInvalid &&
    !stopInvalid
      ? Math.abs(numTp - numEntry) / riskPerUnit
      : null;

  let levelsStateText = 'Enter entry and stop';
  if (!levelsValid) {
    levelsStateText = 'Fix the highlighted levels';
  } else if (numEntry > 0 && numSl > 0 && !sizeOk) {
    levelsStateText = 'Risk too small for 0.01 lot';
  } else if (sizeOk) {
    levelsStateText = 'Ready to record';
  }

  const targetPreviewIds =
    selectedAccountIds.length > 0
      ? selectedAccountIds
      : accounts.length > 0
      ? [accounts[0].id]
      : ['unassigned'];

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

  const checklistValues = Object.values(checklist);
  const confirmedChecklistCount = checklistValues.filter(Boolean).length;
  const allChecklistPassed = confirmedChecklistCount === checklistValues.length;

  const canSubmit =
    levelsValid &&
    !calcError &&
    selectedAccountIds.length > 0 &&
    (sizeOk || (Boolean(editTrade) && numEntry > 0 && (numSl > 0 || explicitLots !== null)));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !calcPreview) return;

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
          primaryEquity * ((parseFloat(riskPct) || 1.0) / 100);

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
        : editTrade?.realizedR ?? 0;
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
            : editTrade.plannedRiskUsd && editTrade.plannedRiskUsd > 0
            ? editTrade.plannedRiskUsd
            : totalRiskUsd,
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

    setIsDirty(false);
    onClose();
  };

  return (
    <div
      className="tw-trade-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tw-record-exec-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleSafeClose();
      }}
    >
      <form
        className="tw-trade-modal"
        onSubmit={handleSubmit}
        onChange={() => setIsDirty(true)}
        noValidate
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canSubmit) {
            e.preventDefault();
            handleSubmit(e as unknown as React.FormEvent);
          }
        }}
      >
        {/* Header */}
        <div className="tw-trade-head">
          <div>
            <div className="tw-trade-lab">
              {editTrade ? `Edit execution · ${editTrade.instrumentSymbol}` : 'New trade'}
            </div>
            <h2 id="tw-record-exec-title">
              {editTrade ? `Edit ${editTrade.instrumentSymbol}` : 'Record execution'}
            </h2>
          </div>
          <div className="tw-trade-head-r">
            <span className="tw-trade-lab" style={{ color: 'var(--tw-ink-2)' }}>
              Entries in local time
            </span>
            <button
              type="button"
              className="tw-trade-close"
              onClick={handleSafeClose}
              aria-label="Close record execution modal"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="tw-trade-body">
          {/* 1 · Instrument and direction */}
          <section className="tw-trade-sec" aria-labelledby="tw-sec-1">
            <div className="tw-trade-sec-h">
              <h3 id="tw-sec-1">1 · Instrument and direction</h3>
            </div>
            <div className="tw-trade-grid g3">
              <div className="tw-trade-field">
                <label htmlFor="tw-tr-inst">Instrument</label>
                <select
                  id="tw-tr-inst"
                  className="tw-trade-input"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                >
                  {instruments.map((i) => (
                    <option key={i.symbol} value={i.symbol}>
                      {i.symbol} · {i.name}
                    </option>
                  ))}
                </select>
                <span className="tw-trade-hint">
                  Contract size {(activeInstrument?.contractSize || 1).toLocaleString('en-US')} · from Settings
                </span>
              </div>

              <fieldset
                className="tw-trade-field tw-trade-span2"
                style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
              >
                <legend className="tw-trade-fl" style={{ padding: 0, marginBottom: 6 }}>
                  Direction
                </legend>
                <div className="tw-trade-seg" role="radiogroup" aria-label="Direction">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={direction === 'BUY'}
                    className={direction === 'BUY' ? 'buy-on' : ''}
                    onClick={() => {
                      setDirection('BUY');
                      setIsDirty(true);
                    }}
                  >
                    &#8599; Buy / long
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={direction === 'SELL'}
                    className={direction === 'SELL' ? 'sell-on' : ''}
                    onClick={() => {
                      setDirection('SELL');
                      setIsDirty(true);
                    }}
                  >
                    &#8600; Sell / short
                  </button>
                </div>
                <span className="tw-trade-hint">
                  {direction === 'BUY'
                    ? 'Stop must sit below entry; target above.'
                    : 'Stop must sit above entry; target below.'}
                </span>
              </fieldset>
            </div>

            <div className="tw-trade-grid g3">
              <div className="tw-trade-field">
                <label htmlFor="tw-tr-status">Execution status</label>
                <select
                  id="tw-tr-status"
                  className="tw-trade-input"
                  value={status}
                  disabled={editTrade?.status === 'CLOSED'}
                  onChange={(e) => setStatus(e.target.value as TradeStatus)}
                >
                  <option value="OPEN">Open (active position)</option>
                  <option value="CLOSED">Closed (completed trade)</option>
                  <option value="PLANNED">Planned (order limit / setup)</option>
                </select>
                <span className="tw-trade-hint">&nbsp;</span>
              </div>

              <div className="tw-trade-field">
                <label htmlFor="tw-tr-strat">Strategy</label>
                <select
                  id="tw-tr-strat"
                  className="tw-trade-input"
                  value={strategyId}
                  onChange={(e) => setStrategyId(e.target.value)}
                >
                  <option value="">No strategy linked</option>
                  {strategies.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <span className="tw-trade-hint">Optional. Links attribution.</span>
              </div>

              <div className="tw-trade-field">
                <label htmlFor="tw-tr-setup">Setup type</label>
                <input
                  id="tw-tr-setup"
                  className="tw-trade-input"
                  value={setupType}
                  onChange={(e) => setSetupType(e.target.value)}
                  placeholder="e.g. Liquidity sweep"
                  autoComplete="off"
                />
                <span className="tw-trade-hint">&nbsp;</span>
              </div>
            </div>
          </section>

          {/* 2 · Timing */}
          <section className="tw-trade-sec" aria-labelledby="tw-sec-2">
            <div className="tw-trade-sec-h">
              <h3 id="tw-sec-2">2 · Timing</h3>
              <button
                type="button"
                className="tw-ana-icon-btn"
                onClick={() => {
                  const today = getLocalTodayDateStr();
                  setTradeDate(today);
                  setExitDate(today);
                }}
              >
                Today ({getLocalTodayDateStr()})
              </button>
            </div>
            <div className="tw-trade-grid g3">
              <div className="tw-trade-field">
                <label htmlFor="tw-tr-date">Entry date</label>
                <input
                  id="tw-tr-date"
                  type="date"
                  className="tw-trade-input"
                  value={tradeDate}
                  onChange={(e) => {
                    setTradeDate(e.target.value);
                    if (!editTrade) setExitDate(e.target.value);
                  }}
                  required
                />
                <span className="tw-trade-hint">&nbsp;</span>
              </div>

              <div className="tw-trade-field">
                <label htmlFor="tw-tr-time">Entry time</label>
                <input
                  id="tw-tr-time"
                  type="time"
                  className="tw-trade-input"
                  value={entryClock}
                  onChange={(e) => setEntryClock(e.target.value)}
                />
                <span className="tw-trade-hint">&nbsp;</span>
              </div>

              <div className="tw-trade-field">
                <label htmlFor="tw-tr-sess">Session</label>
                <select
                  id="tw-tr-sess"
                  className="tw-trade-input"
                  value={session}
                  onChange={(e) => setSession(e.target.value as typeof session)}
                >
                  <option value="London">London (08:00 UTC)</option>
                  <option value="New York">New York (13:30 UTC)</option>
                  <option value="London Close">London Close (15:30 UTC)</option>
                  <option value="Asian">Asian (00:00 UTC)</option>
                  <option value="Sydney">Sydney (21:00 UTC)</option>
                </select>
                <span className="tw-trade-hint">&nbsp;</span>
              </div>
            </div>

            <div className="tw-trade-grid g3">
              <div className="tw-trade-field">
                <label htmlFor="tw-tr-tf">Timeframe</label>
                <select
                  id="tw-tr-tf"
                  className="tw-trade-input"
                  value={timeframe}
                  onChange={(e) => setTimeframe(e.target.value)}
                >
                  <option value="1M">1 minute</option>
                  <option value="5M">5 minutes</option>
                  <option value="15M">15 minutes</option>
                  <option value="1H">1 hour</option>
                  <option value="4H">4 hours</option>
                  <option value="D1">1 day</option>
                </select>
                <span className="tw-trade-hint">&nbsp;</span>
              </div>

              {status === 'CLOSED' && (
                <>
                  <div className="tw-trade-field">
                    <label htmlFor="tw-tr-exit-date">Exit date</label>
                    <input
                      id="tw-tr-exit-date"
                      type="date"
                      className="tw-trade-input"
                      value={exitDate}
                      onChange={(e) => setExitDate(e.target.value)}
                    />
                    <span className="tw-trade-hint">&nbsp;</span>
                  </div>
                  <div className="tw-trade-field">
                    <label htmlFor="tw-tr-exit-time">Exit time</label>
                    <input
                      id="tw-tr-exit-time"
                      type="time"
                      className="tw-trade-input"
                      value={exitClock}
                      onChange={(e) => setExitClock(e.target.value)}
                    />
                    <span className="tw-trade-hint">&nbsp;</span>
                  </div>
                </>
              )}
            </div>
          </section>

          {/* 3 · Levels and risk */}
          <section className="tw-trade-sec" aria-labelledby="tw-sec-3">
            <div className="tw-trade-sec-h">
              <h3 id="tw-sec-3">3 · Levels and risk</h3>
              <span className="tw-trade-lab">{levelsStateText}</span>
            </div>

            <div className="tw-trade-grid">
              <div className="tw-trade-field">
                <label htmlFor="tw-tr-entry">Entry price</label>
                <input
                  id="tw-tr-entry"
                  type="number"
                  step="any"
                  min="0"
                  inputMode="decimal"
                  className="tw-trade-input"
                  value={entryPrice}
                  onChange={(e) => setEntryPrice(e.target.value)}
                  placeholder="0.00"
                  aria-invalid={entryInvalid ? 'true' : undefined}
                />
                <span className={`tw-trade-hint ${entryInvalid ? 'err' : ''}`}>{entryHint}</span>
              </div>

              <div className="tw-trade-field">
                <label className="sl" htmlFor="tw-tr-stop">Stop loss</label>
                <input
                  id="tw-tr-stop"
                  type="number"
                  step="any"
                  min="0"
                  inputMode="decimal"
                  className="tw-trade-input"
                  value={stopLoss}
                  onChange={(e) => setStopLoss(e.target.value)}
                  placeholder="0.00"
                  aria-invalid={stopInvalid ? 'true' : undefined}
                />
                <span className={`tw-trade-hint ${stopInvalid ? 'err' : ''}`}>{stopHint}</span>
              </div>

              <div className="tw-trade-field">
                <label className="tp" htmlFor="tw-tr-tp">
                  Take profit <span style={{ textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                </label>
                <input
                  id="tw-tr-tp"
                  type="number"
                  step="any"
                  min="0"
                  inputMode="decimal"
                  className="tw-trade-input"
                  value={takeProfit}
                  onChange={(e) => setTakeProfit(e.target.value)}
                  placeholder="0.00"
                  aria-invalid={tpInvalid ? 'true' : undefined}
                />
                <span className={`tw-trade-hint ${tpInvalid ? 'err' : ''}`}>{tpHint}</span>
              </div>

              <div className="tw-trade-field">
                <label className="rk" htmlFor="tw-tr-risk">Risk per trade (%)</label>
                <input
                  id="tw-tr-risk"
                  type="number"
                  step="0.1"
                  min="0"
                  max="10"
                  inputMode="decimal"
                  className="tw-trade-input"
                  value={riskPct}
                  onChange={(e) => setRiskPct(e.target.value)}
                  aria-invalid={riskInvalid ? 'true' : undefined}
                />
                <span className={`tw-trade-hint ${riskTone}`}>{riskHint}</span>
              </div>
            </div>

            {status === 'CLOSED' && (
              <div className="tw-trade-grid g3">
                <div className="tw-trade-field">
                  <label htmlFor="tw-tr-exit-price">Exit price</label>
                  <input
                    id="tw-tr-exit-price"
                    type="number"
                    step="any"
                    inputMode="decimal"
                    className="tw-trade-input"
                    value={exitPrice}
                    onChange={(e) => setExitPrice(e.target.value)}
                    placeholder="Optional"
                  />
                  <span className="tw-trade-hint">Computes net P&amp;L automatically</span>
                </div>

                <div className="tw-trade-field">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="tp" htmlFor="tw-tr-net">Realized net P&amp;L ($)</label>
                    {isManualNetOverride && numExit > 0 && (
                      <button
                        type="button"
                        className="tw-ana-link-btn"
                        onClick={() => {
                          setIsManualNetOverride(false);
                          setRealizedNetInput('');
                        }}
                      >
                        Auto
                      </button>
                    )}
                  </div>
                  <input
                    id="tw-tr-net"
                    type="number"
                    step="any"
                    inputMode="decimal"
                    className="tw-trade-input"
                    value={realizedNetInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      setRealizedNetInput(val);
                      setIsManualNetOverride(val.trim() !== '');
                    }}
                    placeholder={
                      !isManualNetOverride && numExit > 0 && closedCalcPreview
                        ? `Auto: ${formatMoney(closedCalcPreview.net, true)}`
                        : 'Auto from exit, or enter $'
                    }
                  />
                  <span className="tw-trade-hint">&nbsp;</span>
                </div>

                <div className="tw-trade-field">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label htmlFor="tw-tr-realized-r">Realized R-multiple</label>
                    {isManualROverride && (
                      <button
                        type="button"
                        className="tw-ana-link-btn"
                        onClick={() => {
                          setIsManualROverride(false);
                          setRealizedRInput('');
                        }}
                      >
                        Auto
                      </button>
                    )}
                  </div>
                  <input
                    id="tw-tr-realized-r"
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    className="tw-trade-input"
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
                  />
                  <span className="tw-trade-hint">&nbsp;</span>
                </div>
              </div>
            )}

            <div className="tw-trade-calc" aria-live="polite">
              <div>
                <span className="tw-trade-lab">Risk per unit</span>
                <strong>
                  {riskPerUnit !== null && riskPerUnit > 0
                    ? riskPerUnit.toLocaleString('en-US', { maximumFractionDigits: 5 })
                    : '—'}
                </strong>
              </div>
              <div>
                <span className="tw-trade-lab">Risk amount</span>
                <strong className={isPnlHidden ? 'tw-pnl-blur' : ''}>
                  {formatMoney(riskAmountPreview)}
                </strong>
              </div>
              <div>
                <span className="tw-trade-lab">Size, rounded down</span>
                <strong>
                  {numEntry > 0 && (numSl > 0 || explicitLots !== null) && levelsValid
                    ? sizeOk
                      ? `${effectiveLotsPreview.toFixed(2)} lots`
                      : 'Below 0.01 lot'
                    : '—'}
                </strong>
              </div>
              <div>
                <span className="tw-trade-lab">Reward : risk</span>
                <strong className={plannedRrPreview !== null && plannedRrPreview < 1 ? 'rr-low' : ''}>
                  {plannedRrPreview !== null ? `${plannedRrPreview.toFixed(2)} R` : '—'}
                </strong>
              </div>

              {closedCalcPreview && (
                <div className="tw-trade-calc-closed">
                  <div>
                    <span className="tw-trade-lab">Gross P&amp;L</span>
                    <strong className={isPnlHidden ? 'tw-pnl-blur' : ''}>
                      {formatMoney(closedCalcPreview.gross, true)}
                    </strong>
                  </div>
                  <div>
                    <span className="tw-trade-lab">Commission</span>
                    <strong className={isPnlHidden ? 'tw-pnl-blur' : ''}>
                      {formatMoney(-closedCalcPreview.commission)}
                    </strong>
                  </div>
                  <div>
                    <span className="tw-trade-lab">Net P&amp;L</span>
                    <strong className={isPnlHidden ? 'tw-pnl-blur' : ''}>
                      {formatMoney(closedCalcPreview.net, true)}
                    </strong>
                  </div>
                  <div>
                    <span className="tw-trade-lab">Realized R</span>
                    <strong>
                      {closedCalcPreview.r >= 0 ? '+' : '−'}
                      {Math.abs(closedCalcPreview.r).toFixed(2)} R
                    </strong>
                  </div>
                </div>
              )}
            </div>

            {calcError && (
              <div className="tw-trade-warnbox" role="alert">
                {calcError}
              </div>
            )}

            <p className="tw-trade-note">
              Size is rounded down to 0.01 lots, so the risk never exceeds the amount shown. The app confirms the final size on save.
            </p>
          </section>

          {/* 4 · Allocate across accounts */}
          <section className="tw-trade-sec" aria-labelledby="tw-sec-4">
            <div className="tw-trade-sec-h">
              <h3 id="tw-sec-4">4 · Allocate across accounts</h3>
              <span className={`tw-trade-hint ${selectedAccountIds.length === 0 ? 'err' : ''}`}>
                {selectedAccountIds.length === 0
                  ? 'Select at least one account'
                  : `${selectedAccountIds.length} selected`}
              </span>
            </div>

            <div className="tw-trade-grid g3">
              {accounts.map((acc) => {
                const isSelected = selectedAccountIds.includes(acc.id);
                return (
                  <button
                    key={acc.id}
                    type="button"
                    className={`tw-trade-acct ${isSelected ? '' : 'off'}`}
                    aria-pressed={isSelected}
                    onClick={() => {
                      setIsDirty(true);
                      if (isSelected) {
                        setSelectedAccountIds(selectedAccountIds.filter((id) => id !== acc.id));
                      } else {
                        setSelectedAccountIds([...selectedAccountIds, acc.id]);
                      }
                    }}
                  >
                    <span>
                      <strong>{acc.name}</strong>
                      <small className={isPnlHidden ? 'tw-pnl-blur' : ''}>
                        Equity {formatMoney(acc.currentEquity)}
                      </small>
                    </span>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      readOnly
                      tabIndex={-1}
                      aria-hidden="true"
                      style={{ width: 18, height: 18, accentColor: 'var(--tw-gain)', flex: 'none' }}
                    />
                  </button>
                );
              })}
            </div>

            <div className="tw-trade-grid g2">
              <div className="tw-trade-field">
                <label htmlFor="tw-tr-lots">Position size override (lots)</label>
                <input
                  id="tw-tr-lots"
                  type="number"
                  step="0.01"
                  min="0.01"
                  inputMode="decimal"
                  className="tw-trade-input"
                  value={customPositionSize}
                  onChange={(e) => setCustomPositionSize(e.target.value)}
                  placeholder="Leave blank to size from risk"
                />
                <span className="tw-trade-hint">&nbsp;</span>
              </div>

              <div className="tw-trade-field">
                <label htmlFor="tw-tr-comm">Commission ($)</label>
                <input
                  id="tw-tr-comm"
                  type="number"
                  step="any"
                  min="0"
                  inputMode="decimal"
                  className="tw-trade-input"
                  value={commissionInput}
                  onChange={(e) => setCommissionInput(e.target.value)}
                  placeholder={calcPreview ? `Auto ($${previewAutoCommission.toFixed(2)})` : 'Auto'}
                />
                <span className="tw-trade-hint">&nbsp;</span>
              </div>
            </div>
          </section>

          {/* 5 · Pre-trade checklist */}
          <section className="tw-trade-sec" aria-labelledby="tw-sec-5">
            <div className="tw-trade-sec-h">
              <h3 id="tw-sec-5">5 · Pre-trade checklist</h3>
              <span className="tw-trade-lab">{confirmedChecklistCount} of 6 confirmed</span>
            </div>

            <div className="tw-trade-checks" role="group" aria-label="Pre-trade checklist">
              <label>
                <input
                  type="checkbox"
                  checked={checklist.biasConfirmed}
                  onChange={(e) => setChecklist({ ...checklist, biasConfirmed: e.target.checked })}
                />
                <span>HTF bias aligned</span>
              </label>

              <label>
                <input
                  type="checkbox"
                  checked={checklist.validTrigger}
                  onChange={(e) => setChecklist({ ...checklist, validTrigger: e.target.checked })}
                />
                <span>Valid setup trigger</span>
              </label>

              <label>
                <input
                  type="checkbox"
                  checked={checklist.slTechnical}
                  onChange={(e) => setChecklist({ ...checklist, slTechnical: e.target.checked })}
                />
                <span>Technical invalidation SL</span>
              </label>

              <label>
                <input
                  type="checkbox"
                  checked={checklist.riskWithinLimits}
                  onChange={(e) => setChecklist({ ...checklist, riskWithinLimits: e.target.checked })}
                />
                <span>Risk below account limit</span>
              </label>

              <label>
                <input
                  type="checkbox"
                  checked={checklist.noRedFolderNews}
                  onChange={(e) => setChecklist({ ...checklist, noRedFolderNews: e.target.checked })}
                />
                <span>No high-impact news</span>
              </label>

              <label>
                <input
                  type="checkbox"
                  checked={checklist.noFomo}
                  onChange={(e) => setChecklist({ ...checklist, noFomo: e.target.checked })}
                />
                <span>No FOMO or impatience</span>
              </label>
            </div>

            {!allChecklistPassed && (
              <div className="tw-trade-warnbox">
                Some checks are unconfirmed. You can still record the trade; it will be saved with those checks marked open.
              </div>
            )}
          </section>

          {/* 6 · Thesis and technical bias */}
          <section className="tw-trade-sec" aria-labelledby="tw-sec-6">
            <div className="tw-trade-sec-h">
              <h3 id="tw-sec-6">6 · Thesis and technical bias</h3>
            </div>
            <div className="tw-trade-field">
              <label htmlFor="tw-tr-thesis">Reasoning</label>
              <textarea
                id="tw-tr-thesis"
                className="tw-trade-input"
                maxLength={600}
                value={tradeThesis}
                onChange={(e) => setTradeThesis(e.target.value)}
                placeholder="Confluence, key price level, market structure…"
              />
              <div className="tw-trade-lab" style={{ textAlign: 'right' }}>
                {tradeThesis.length} / 600
              </div>
            </div>
          </section>
        </div>

        {/* Sticky Footer Summary + Actions */}
        <footer className="tw-trade-actions">
          <div className="tw-trade-summary" aria-label="Trade summary">
            <span className={`tw-trade-chip ${direction === 'BUY' ? 'dir-l' : 'dir-s'}`}>
              {direction === 'BUY' ? 'Buy' : 'Sell'}
            </span>
            <span className="tw-trade-chip">{symbol}</span>
            <span className={`tw-trade-chip ${isPnlHidden ? 'tw-pnl-blur' : ''}`}>
              Risk {formatMoney(riskAmountPreview)}
            </span>
            <span className="tw-trade-chip">
              Size {sizeOk ? `${effectiveLotsPreview.toFixed(2)} lots` : '—'}
            </span>
            <span className="tw-trade-chip">
              {selectedAccountIds.length} account{selectedAccountIds.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="tw-trade-btns">
            <button type="button" className="tw-trade-ghost" onClick={handleSafeClose}>
              Cancel
            </button>
            <button type="submit" className="tw-trade-btn" disabled={!canSubmit}>
              {editTrade ? 'Save execution changes' : 'Record execution'}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
};
