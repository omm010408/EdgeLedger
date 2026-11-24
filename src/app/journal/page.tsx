'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useTrading } from '../../context/TradingContext';
import { JournalEntry } from '../../lib/data/seedData';
import { Plus, X, ExternalLink, ShieldAlert, Check } from 'lucide-react';

export default function JournalPage() {
  const {
    journalEntries,
    addJournalEntry,
    updateJournalEntry,
    accounts,
    trades,
    selectedAccountId,
    setSelectedAccountId,
  } = useTrading();

  // Period Filter: Week | Month | All time
  const [period, setPeriod] = useState<'Week' | 'Month' | 'All time'>('All time');

  // Modal State for New Journal Entry
  const [modalOpen, setModalOpen] = useState(false);

  // Selected Session (defaults to latest or 2024-03-18)
  const [selectedEntryId, setSelectedEntryId] = useState<string>(() => {
    return journalEntries[0]?.id || 'j-2024-03-18';
  });

  // Filtered and Sorted entries (newest date first)
  const sortedEntries = useMemo(() => {
    const list = [...journalEntries];
    return list.sort((a, b) => (a.entryDate < b.entryDate ? 1 : -1));
  }, [journalEntries]);

  // Selected Entry
  const activeEntry = useMemo(() => {
    return (
      sortedEntries.find((e) => e.id === selectedEntryId) ||
      sortedEntries[0] ||
      null
    );
  }, [sortedEntries, selectedEntryId]);

  // Trades linked to the selected entry's date
  const linkedTrades = useMemo(() => {
    if (!activeEntry) return [];
    return trades.filter((t) => t.entryTime && t.entryTime.startsWith(activeEntry.entryDate));
  }, [trades, activeEntry]);

  // Average & Median Discipline calculations
  const disciplineMetrics = useMemo(() => {
    if (sortedEntries.length === 0) {
      return {
        avg: 8.0,
        median: 8.0,
        min: 8,
        max: 8,
        leaksCount: 0,
        total: 0,
      };
    }
    const scores = sortedEntries.map((e) => e.disciplineScore);
    const sum = scores.reduce((acc, v) => acc + v, 0);
    const avg = sum / scores.length;

    const sortedScores = [...scores].sort((a, b) => a - b);
    const mid = Math.floor(sortedScores.length / 2);
    const median =
      sortedScores.length % 2 !== 0
        ? sortedScores[mid]
        : (sortedScores[mid - 1] + sortedScores[mid]) / 2;

    const min = sortedScores[0];
    const max = sortedScores[sortedScores.length - 1];

    const leaksCount = sortedEntries.filter(
      (e) =>
        e.fomoDetected ||
        e.revengeTrading ||
        e.overtrading ||
        e.movedStopLoss ||
        e.ignoredRules ||
        e.prematureExit
    ).length;

    return {
      avg,
      median,
      min,
      max,
      leaksCount,
      total: sortedEntries.length,
    };
  }, [sortedEntries]);

  // Helper for circular progress ring stroke-dasharray (circumference of r=18 is ~113.1)
  const getRingDash = (score: number, max: number = 10) => {
    const clamped = Math.min(Math.max(score, 0), max);
    const circumference = 113.1;
    const offset = (clamped / max) * circumference;
    return `${offset.toFixed(1)} ${circumference}`;
  };

  // Helper to toggle a pitfall on the active entry
  const handleTogglePitfall = (field: keyof JournalEntry) => {
    if (!activeEntry) return;
    const updated: JournalEntry = {
      ...activeEntry,
      [field]: !activeEntry[field],
    };
    updateJournalEntry(updated);
  };

  // Check if active entry has behavioral leaks
  const activeHasLeaks = useMemo(() => {
    if (!activeEntry) return false;
    return (
      activeEntry.fomoDetected ||
      activeEntry.revengeTrading ||
      activeEntry.overtrading ||
      activeEntry.movedStopLoss ||
      activeEntry.ignoredRules ||
      activeEntry.prematureExit
    );
  }, [activeEntry]);

  // Format short date for chips (e.g. "18 Mar")
  const formatShortDate = (dateStr: string) => {
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const monthNames = [
          'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
          'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
        ];
        const monthIdx = parseInt(parts[1], 10) - 1;
        return `${parseInt(parts[2], 10)} ${monthNames[monthIdx] || parts[1]}`;
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  // New Journal Entry Form State
  const [newDate, setNewDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [newMood, setNewMood] = useState<JournalEntry['emotionalState']>('Disciplined');
  const [newPrepScore, setNewPrepScore] = useState(9);
  const [newExecScore, setNewExecScore] = useState(9);
  const [newDiscScore, setNewDiscScore] = useState(9);
  const [newMacro, setNewMacro] = useState('');
  const [newHtf, setNewHtf] = useState('');
  const [newPlan, setNewPlan] = useState('');
  const [newSummary, setNewSummary] = useState('');
  const [newLesson, setNewLesson] = useState('');
  const [newFomo, setNewFomo] = useState(false);
  const [newRevenge, setNewRevenge] = useState(false);
  const [newOvertrade, setNewOvertrade] = useState(false);
  const [newMovedSl, setNewMovedSl] = useState(false);
  const [newIgnoredRules, setNewIgnoredRules] = useState(false);

  const handleCreateEntry = (e: React.FormEvent) => {
    e.preventDefault();
    const entryId = `j-${newDate}-${Date.now().toString().slice(-4)}`;
    addJournalEntry({
      id: entryId,
      entryDate: newDate,
      emotionalState: newMood,
      preparationScore: newPrepScore,
      executionScore: newExecScore,
      disciplineScore: newDiscScore,
      macroEnvironment: newMacro || 'Neutral macro environment; watching rates and dollar index.',
      higherTimeframeBias: newHtf || 'Aligned with HTF market structure.',
      tradingPlan: newPlan || 'Follow predefined entry criteria, respect risk limits.',
      dailySummary: newSummary || 'Session completed adhering to risk parameters.',
      lessonsLearned: newLesson || 'Process execution matters more than single-trade outcome.',
      fomoDetected: newFomo,
      revengeTrading: newRevenge,
      overtrading: newOvertrade,
      movedStopLoss: newMovedSl,
      ignoredRules: newIgnoredRules,
      prematureExit: false,
    });
    setSelectedEntryId(entryId);
    setModalOpen(false);
  };

  return (
    <div className="tw-journal-board">
      {/* Title & Controls Row */}
      <div className="tw-journal-titlerow">
        <div>
          <h1>Trading journal</h1>
          <p>
            Context, plan, debrief and a discipline score you set yourself. Scores are never estimated from P&amp;L.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {/* Period Seg */}
          <div className="tw-seg" role="group" aria-label="Period">
            {(['Week', 'Month', 'All time'] as const).map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={period === p}
                onClick={() => setPeriod(p)}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Account Filter */}
          <button
            type="button"
            className="btn quiet"
            onClick={() => {
              if (selectedAccountId === 'ALL' && accounts.length > 0) {
                setSelectedAccountId(accounts[0].id);
              } else {
                setSelectedAccountId('ALL');
              }
            }}
          >
            {selectedAccountId === 'ALL'
              ? `All accounts, ${accounts.length}`
              : accounts.find((a) => a.id === selectedAccountId)?.name || `All accounts, ${accounts.length}`}
          </button>

          {/* New Entry Button */}
          <button
            type="button"
            className="btn dark flex items-center gap-1.5"
            onClick={() => setModalOpen(true)}
          >
            <Plus size={14} />
            <span>New journal entry</span>
          </button>
        </div>
      </div>

      {/* Main 12-Column Grid */}
      <main className="tw-journal-grid">
        {/* Left Aside (Cols 1-4): Session List + Average Discipline */}
        <aside className="tw-journal-side" aria-label="Past sessions">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--tw-ink-3)] px-1">
            Past sessions · {sortedEntries.length}
          </div>

          {/* Scrollable Session List */}
          <div className="tw-journal-sess-list" role="list">
            {sortedEntries.map((entry) => {
              const isSelected = entry.id === activeEntry?.id;
              const hasLeaks =
                entry.fomoDetected ||
                entry.revengeTrading ||
                entry.overtrading ||
                entry.movedStopLoss ||
                entry.ignoredRules ||
                entry.prematureExit;

              const scoreCls =
                entry.disciplineScore >= 8
                  ? 'tw-score-ok'
                  : entry.disciplineScore >= 5
                  ? 'tw-score-mid'
                  : 'tw-score-low';

              return (
                <button
                  key={entry.id}
                  className="tw-journal-sess"
                  type="button"
                  aria-current={isSelected}
                  onClick={() => setSelectedEntryId(entry.id)}
                >
                  <div className="row1">
                    <span className="d">{entry.entryDate}</span>
                    <span className={`pill ${scoreCls}`}>
                      Discipline {entry.disciplineScore}/10
                    </span>
                  </div>
                  <p>{entry.dailySummary || entry.tradingPlan || 'No summary recorded.'}</p>
                  <div className="row2">
                    <span>Mood: {entry.emotionalState}</span>
                    {hasLeaks ? (
                      <span className="tw-journal-flagp">
                        <ShieldAlert size={12} />
                        Behavioral leak
                      </span>
                    ) : (
                      <span>Self-scored</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Average Discipline Tile */}
          <section className="tw-journal-trend" aria-label="Average discipline">
            <div className="flex items-center justify-between">
              <span className="lbl">Average discipline</span>
            </div>
            <div className="avgrow">
              <span className="avgv">{disciplineMetrics.avg.toFixed(1)}</span>
              <span className="avgof">/ 10</span>
            </div>

            {/* 3-Band Scale */}
            <div
              className="tw-journal-scale"
              role="img"
              aria-label={`Average discipline ${disciplineMetrics.avg.toFixed(1)} on a 0 to 10 scale`}
            >
              <div className="tw-journal-bands">
                <i className="b-off" title="0-4: Off plan"></i>
                <i className="b-mix" title="5-7: Mixed"></i>
                <i className="b-on" title="8-10: Disciplined"></i>
              </div>
              <i
                className="avgmark"
                style={{ left: `${Math.min(Math.max(disciplineMetrics.avg * 10, 0), 100)}%` }}
                title={`Average: ${disciplineMetrics.avg.toFixed(1)}`}
              ></i>
              {/* Dots for last entries */}
              {sortedEntries.slice(0, 5).map((e) => (
                <i
                  key={e.id}
                  className="dot"
                  style={{ left: `${Math.min(Math.max(e.disciplineScore * 10, 0), 100)}%` }}
                  title={`${e.entryDate}: ${e.disciplineScore}/10`}
                ></i>
              ))}
            </div>

            <div className="tw-journal-ticks">
              <span>0</span>
              <span>5</span>
              <span>8</span>
              <span>10</span>
            </div>

            {/* Chips of last 3 sessions */}
            <div className="tw-journal-chips">
              {sortedEntries.slice(0, 3).map((e) => (
                <div
                  key={e.id}
                  className={`tw-journal-ck ${e.disciplineScore < 7 ? 'low' : ''}`}
                >
                  <small>{formatShortDate(e.entryDate)}</small>
                  <b>{e.disciplineScore}</b>
                </div>
              ))}
            </div>

            {/* Stats: Median, Range, Leaks */}
            <div className="tw-journal-stats3">
              <div>
                <small>Median</small>
                <b>{disciplineMetrics.median.toFixed(1)}</b>
              </div>
              <div>
                <small>Range</small>
                <b>
                  {disciplineMetrics.min} to {disciplineMetrics.max}
                </b>
              </div>
              <div>
                <small>Leaks</small>
                <b>
                  {disciplineMetrics.leaksCount} of {disciplineMetrics.total}
                </b>
              </div>
            </div>

            <div className="tw-journal-legend">
              Self-scored. Bands: 0 to 4 off plan, 5 to 7 mixed, 8 to 10 disciplined.
            </div>
          </section>
        </aside>

        {/* Right Detail Card (Cols 5-12) */}
        {activeEntry ? (
          <section
            className="tw-journal-detail"
            aria-label={`Session journal, ${activeEntry.entryDate}`}
          >
            {/* Detail Header */}
            <div className="tw-journal-dhead">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--tw-ink-3)]">
                  Session journal
                </div>
                <h2>{activeEntry.entryDate}</h2>
                <div className="tw-journal-meta">
                  <span className="mood">{activeEntry.emotionalState}</span>
                  <span className="text-xs text-[var(--tw-ink-2)] font-medium">
                    {linkedTrades.length > 0 ? `${linkedTrades.length} trades · ` : ''}Self-scored
                  </span>
                </div>
              </div>

              {/* 3 Circular SVG Score Rings */}
              <div className="tw-journal-scores">
                {/* Prep Score */}
                <div className="tw-journal-sc p" title="Preparation Quality">
                  <svg viewBox="0 0 44 44" aria-hidden="true">
                    <circle className="ring-bg" cx="22" cy="22" r="18" />
                    <circle
                      className="ring"
                      cx="22"
                      cy="22"
                      r="18"
                      strokeDasharray={getRingDash(activeEntry.preparationScore)}
                    />
                  </svg>
                  <div className="txt">
                    {activeEntry.preparationScore}/10
                    <small>Prep</small>
                  </div>
                </div>

                {/* Execution Score */}
                <div className="tw-journal-sc e" title="Execution Quality">
                  <svg viewBox="0 0 44 44" aria-hidden="true">
                    <circle className="ring-bg" cx="22" cy="22" r="18" />
                    <circle
                      className="ring"
                      cx="22"
                      cy="22"
                      r="18"
                      strokeDasharray={getRingDash(activeEntry.executionScore)}
                    />
                  </svg>
                  <div className="txt">
                    {activeEntry.executionScore}/10
                    <small>Execution</small>
                  </div>
                </div>

                {/* Discipline Score (Sun Highlighted) */}
                <div className="tw-journal-sc hi" title="Overall Discipline">
                  <svg viewBox="0 0 44 44" aria-hidden="true">
                    <circle className="ring-bg" cx="22" cy="22" r="18" />
                    <circle
                      className="ring"
                      cx="22"
                      cy="22"
                      r="18"
                      strokeDasharray={getRingDash(activeEntry.disciplineScore)}
                    />
                  </svg>
                  <div className="txt">
                    {activeEntry.disciplineScore}/10
                    <small>Discipline</small>
                  </div>
                </div>
              </div>
            </div>

            {/* Sections Grid */}
            <div className="tw-journal-secs">
              {/* Macro Backdrop */}
              <div className="tw-journal-sec">
                <span className="eyebrow">Macro backdrop and catalysts</span>
                <p>{activeEntry.macroEnvironment || 'No macro catalysts noted for this session.'}</p>
              </div>

              {/* HTF Bias */}
              <div className="tw-journal-sec">
                <span className="eyebrow">HTF bias and narrative</span>
                <p>{activeEntry.higherTimeframeBias || 'Neutral structure; aligned with key levels.'}</p>
              </div>

              {/* Session Trading Plan */}
              <div className="tw-journal-sec plan wide">
                <span className="eyebrow">Session trading plan and gameplan</span>
                <p>{activeEntry.tradingPlan || 'No specific pre-session checklist recorded.'}</p>
              </div>

              {/* Execution Summary & Debrief */}
              <div className="tw-journal-sec exec wide">
                <span className="eyebrow">Post-session debrief and execution summary</span>
                <p>{activeEntry.dailySummary || 'Debrief pending entry.'}</p>
                <div className="tw-journal-link">
                  <span>
                    {linkedTrades.length > 0
                      ? `Linked executions: ${linkedTrades.length} trades recorded`
                      : 'Linked executions: none recorded today'}
                  </span>
                  <Link
                    href="/trades"
                    className="btn quiet text-xs inline-flex items-center gap-1 hover:text-[var(--tw-ink)]"
                    style={{ height: '28px', padding: '0 12px' }}
                  >
                    <span>View trades</span>
                    <ExternalLink size={12} />
                  </Link>
                </div>
              </div>

              {/* Key Lesson */}
              <div className="tw-journal-sec lesson wide">
                <span className="eyebrow">Key lesson and rule reinforcement</span>
                <p>{activeEntry.lessonsLearned || 'No lesson recorded for this session.'}</p>
              </div>

              {/* Behavioral Pitfalls Checklist */}
              <div className="tw-journal-pitfalls wide" aria-label="Behavioral pitfalls audit">
                <span className="eyebrow">
                  Behavioral pitfalls audit · {activeHasLeaks ? 'leaks flagged this session' : 'none flagged this session'}
                </span>

                <button
                  type="button"
                  onClick={() => handleTogglePitfall('fomoDetected')}
                  className={`tw-journal-pf ${activeEntry.fomoDetected ? 'on' : ''}`}
                >
                  <i></i>FOMO
                </button>

                <button
                  type="button"
                  onClick={() => handleTogglePitfall('revengeTrading')}
                  className={`tw-journal-pf ${activeEntry.revengeTrading ? 'on' : ''}`}
                >
                  <i></i>Revenge trading
                </button>

                <button
                  type="button"
                  onClick={() => handleTogglePitfall('overtrading')}
                  className={`tw-journal-pf ${activeEntry.overtrading ? 'on' : ''}`}
                >
                  <i></i>Overtrading
                </button>

                <button
                  type="button"
                  onClick={() => handleTogglePitfall('movedStopLoss')}
                  className={`tw-journal-pf ${activeEntry.movedStopLoss ? 'on' : ''}`}
                >
                  <i></i>Moved stop loss
                </button>

                <button
                  type="button"
                  onClick={() => handleTogglePitfall('ignoredRules')}
                  className={`tw-journal-pf ${activeEntry.ignoredRules ? 'on' : ''}`}
                >
                  <i></i>Ignored plan or rules
                </button>

                <button
                  type="button"
                  onClick={() => handleTogglePitfall('prematureExit')}
                  className={`tw-journal-pf ${activeEntry.prematureExit ? 'on' : ''}`}
                >
                  <i></i>Premature exit
                </button>
              </div>
            </div>
          </section>
        ) : (
          <section className="tw-journal-detail flex items-center justify-center">
            <p className="text-[var(--tw-ink-2)] text-sm">No journal entries found. Click "+ New journal entry" to add one.</p>
          </section>
        )}
      </main>

      {/* New Journal Entry Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-md p-4 sm:p-6 md:p-8 flex justify-center items-start pt-6 sm:pt-10 pb-16"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
        >
          <div className="w-full max-w-3xl rounded-[32px] border border-[var(--tw-line)] bg-[var(--tw-tile)] p-6 sm:p-8 shadow-2xl text-[var(--tw-ink)]">
            <div className="flex items-center justify-between pb-4 border-b border-[var(--tw-line)]">
              <div>
                <h3 className="text-xl font-semibold tracking-tight text-[var(--tw-ink)]">
                  New Journal Entry
                </h3>
                <p className="text-xs text-[var(--tw-ink-2)] mt-1">
                  Record market context, gameplan, and subjective execution discipline scores.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-[var(--tw-pill)] text-[var(--tw-ink-2)] transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateEntry} className="mt-5 space-y-4">
              {/* Row 1: Date & Mood */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="tw-lbl block mb-1 text-xs">Session Date</label>
                  <div className="tw-input">
                    <input
                      type="date"
                      value={newDate}
                      onChange={(e) => setNewDate(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="tw-lbl block mb-1 text-xs">Emotional State / Mood</label>
                  <div className="tw-input">
                    <select
                      value={newMood}
                      onChange={(e) => setNewMood(e.target.value as any)}
                    >
                      <option value="Disciplined">Disciplined</option>
                      <option value="Calm">Calm</option>
                      <option value="Frustrated">Frustrated</option>
                      <option value="Anxious">Anxious</option>
                      <option value="Euphoric">Euphoric</option>
                      <option value="Neutral">Neutral</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Row 2: Self Scores */}
              <div className="grid grid-cols-3 gap-3 p-3.5 rounded-2xl bg-[var(--tw-pill)] border border-[var(--tw-line)]">
                <div>
                  <label className="text-[11px] font-semibold text-[var(--tw-ink-2)] block mb-1">
                    Preparation (1-10)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={newPrepScore}
                    onChange={(e) => setNewPrepScore(parseInt(e.target.value, 10) || 8)}
                    className="w-full bg-[var(--tw-tile)] border border-[var(--tw-line)] rounded-xl px-3 py-1.5 font-mono text-sm font-semibold"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-[var(--tw-ink-2)] block mb-1">
                    Execution (1-10)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={newExecScore}
                    onChange={(e) => setNewExecScore(parseInt(e.target.value, 10) || 8)}
                    className="w-full bg-[var(--tw-tile)] border border-[var(--tw-line)] rounded-xl px-3 py-1.5 font-mono text-sm font-semibold"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-[var(--tw-sun)] block mb-1">
                    Discipline (1-10)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={newDiscScore}
                    onChange={(e) => setNewDiscScore(parseInt(e.target.value, 10) || 8)}
                    className="w-full bg-[var(--tw-tile)] border border-[var(--tw-sun)] rounded-xl px-3 py-1.5 font-mono text-sm font-semibold text-[var(--tw-sun)]"
                  />
                </div>
              </div>

              {/* Macro & HTF */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="tw-lbl block mb-1 text-xs">Macro Backdrop & Catalysts</label>
                  <textarea
                    rows={2}
                    value={newMacro}
                    onChange={(e) => setNewMacro(e.target.value)}
                    placeholder="e.g. US yields slightly softer, DXY hovering near key resistance."
                    className="w-full bg-[var(--tw-tile)] border border-[var(--tw-line)] rounded-xl p-2.5 text-xs text-[var(--tw-ink)] resize-none"
                  />
                </div>
                <div>
                  <label className="tw-lbl block mb-1 text-xs">HTF Bias & Structure</label>
                  <textarea
                    rows={2}
                    value={newHtf}
                    onChange={(e) => setNewHtf(e.target.value)}
                    placeholder="e.g. Bullish Gold, Bearish US30, Neutral EURUSD."
                    className="w-full bg-[var(--tw-tile)] border border-[var(--tw-line)] rounded-xl p-2.5 text-xs text-[var(--tw-ink)] resize-none"
                  />
                </div>
              </div>

              {/* Plan */}
              <div>
                <label className="tw-lbl block mb-1 text-xs">Session Trading Plan</label>
                <textarea
                  rows={2}
                  value={newPlan}
                  onChange={(e) => setNewPlan(e.target.value)}
                  placeholder="e.g. Wait for London open sweep and 5M shift before entering. No afternoon chop."
                  className="w-full bg-[var(--tw-tile)] border border-[var(--tw-line)] rounded-xl p-2.5 text-xs text-[var(--tw-ink)] resize-none"
                />
              </div>

              {/* Debrief */}
              <div>
                <label className="tw-lbl block mb-1 text-xs">Post-Session Debrief & Execution Summary</label>
                <textarea
                  rows={2}
                  value={newSummary}
                  onChange={(e) => setNewSummary(e.target.value)}
                  placeholder="e.g. Executed 2 trades, followed risk rules cleanly and took profit at 2R."
                  className="w-full bg-[var(--tw-tile)] border border-[var(--tw-line)] rounded-xl p-2.5 text-xs text-[var(--tw-ink)] resize-none"
                />
              </div>

              {/* Key Lesson */}
              <div>
                <label className="tw-lbl block mb-1 text-xs">Key Lesson & Rule Reinforced</label>
                <textarea
                  rows={2}
                  value={newLesson}
                  onChange={(e) => setNewLesson(e.target.value)}
                  placeholder="e.g. Letting winners hit targets without micromanaging produced the best R-multiple."
                  className="w-full bg-[var(--tw-tile)] border border-[var(--tw-line)] rounded-xl p-2.5 text-xs text-[var(--tw-ink)] resize-none"
                />
              </div>

              {/* Pitfalls checkboxes */}
              <div>
                <label className="tw-lbl block mb-2 text-xs">Behavioral Pitfalls Audit</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setNewFomo(!newFomo)}
                    className={`tw-journal-pf ${newFomo ? 'on' : ''}`}
                  >
                    <i></i>FOMO
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewRevenge(!newRevenge)}
                    className={`tw-journal-pf ${newRevenge ? 'on' : ''}`}
                  >
                    <i></i>Revenge trading
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewOvertrade(!newOvertrade)}
                    className={`tw-journal-pf ${newOvertrade ? 'on' : ''}`}
                  >
                    <i></i>Overtrading
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewMovedSl(!newMovedSl)}
                    className={`tw-journal-pf ${newMovedSl ? 'on' : ''}`}
                  >
                    <i></i>Moved stop loss
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewIgnoredRules(!newIgnoredRules)}
                    className={`tw-journal-pf ${newIgnoredRules ? 'on' : ''}`}
                  >
                    <i></i>Ignored plan or rules
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--tw-line)]">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="btn quiet text-xs px-4 py-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn dark text-xs px-5 py-2 font-semibold"
                >
                  Save journal entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
