'use client';

import React, { useState } from 'react';
import { useTrading } from '../../context/TradingContext';
import {
  BookOpen,
  Plus,
  Smile,
  Frown,
  Meh,
  AlertOctagon,
  CheckCircle,
  Calendar,
  Flame,
  Award,
  Shield,
  Activity
} from 'lucide-react';
import { JournalEntry } from '../../lib/data/seedData';

export default function JournalPage() {
  const { journalEntries, addJournalEntry } = useTrading();

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(journalEntries[0] || null);

  // New Entry Form State
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [marketConditions, setMarketConditions] = useState('Trending market with high volatility');
  const [macroEnvironment, setMacroEnvironment] = useState('Neutral rate outlook, waiting on CPI data');
  const [higherTimeframeBias, setHigherTimeframeBias] = useState('Bullish Gold, Bearish Indices');
  const [tradingPlan, setTradingPlan] = useState('Wait for 15M sweep during London open. Max 1 trade.');
  const [emotionalState, setEmotionalState] = useState<'Calm' | 'Disciplined' | 'Anxious' | 'Euphoric' | 'Frustrated' | 'Neutral'>('Disciplined');
  const [dailySummary, setDailySummary] = useState('');
  const [lessonsLearned, setLessonsLearned] = useState('');
  const [disciplineScore, setDisciplineScore] = useState(9);
  const [preparationScore, setPreparationScore] = useState(8);
  const [executionScore, setExecutionScore] = useState(9);

  // Psychology checklist
  const [fomo, setFomo] = useState(false);
  const [revenge, setRevenge] = useState(false);
  const [overtrade, setOvertrade] = useState(false);
  const [movedSl, setMovedSl] = useState(false);
  const [prematureExit, setPrematureExit] = useState(false);
  const [ignoredRules, setIgnoredRules] = useState(false);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    addJournalEntry({
      entryDate,
      marketConditions,
      macroEnvironment,
      higherTimeframeBias,
      tradingPlan,
      emotionalState,
      dailySummary,
      lessonsLearned,
      disciplineScore,
      preparationScore,
      executionScore,
      fomoDetected: fomo,
      revengeTrading: revenge,
      overtrading: overtrade,
      movedStopLoss: movedSl,
      prematureExit,
      ignoredRules,
    });

    setModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-edge-border">
        <div>
          <div className="flex items-center space-x-2">
            <BookOpen size={20} className="text-edge-accent" />
            <h1 className="text-xl font-mono font-bold tracking-tight text-white uppercase">
              TRADING JOURNAL & PSYCHOLOGICAL AUDIT
            </h1>
          </div>
          <p className="text-xs text-edge-text-secondary mt-0.5">
            Macro framework, emotional state tracking, and outcome-independent decision quality scoring.
          </p>
        </div>

        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-edge-accent text-edge-bg hover:bg-edge-accent-light font-mono text-xs font-semibold tracking-wide transition-colors self-start sm:self-auto"
        >
          <Plus size={14} />
          <span>NEW JOURNAL ENTRY</span>
        </button>
      </div>

      {/* Main Journal Workspace: Left Index, Right Detailed View */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Date List */}
        <div className="space-y-3">
          <div className="text-xs font-mono text-edge-text-muted uppercase tracking-wider font-semibold">
            Past Trading Sessions ({journalEntries.length})
          </div>

          <div className="space-y-2">
            {journalEntries.map((entry) => {
              const isSelected = selectedEntry?.id === entry.id;
              const hasMistakes = entry.fomoDetected || entry.revengeTrading || entry.overtrading || entry.ignoredRules;

              return (
                <button
                  key={entry.id}
                  onClick={() => setSelectedEntry(entry)}
                  className={`w-full text-left p-3.5 rounded-lg border transition-all font-mono text-xs space-y-2 ${
                    isSelected
                      ? 'bg-edge-surface border-edge-accent text-white shadow-glow'
                      : 'bg-edge-surface/60 border-edge-border text-edge-text-secondary hover:border-edge-border-strong hover:text-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-xs">{entry.entryDate}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        entry.disciplineScore >= 8
                          ? 'bg-edge-profit/20 text-edge-profit'
                          : entry.disciplineScore >= 6
                          ? 'bg-edge-warning/20 text-edge-warning'
                          : 'bg-edge-loss/20 text-edge-loss'
                      }`}
                    >
                      Discipline: {entry.disciplineScore}/10
                    </span>
                  </div>

                  <p className="font-sans text-[11px] line-clamp-2 text-edge-text-secondary">
                    {entry.dailySummary || entry.tradingPlan}
                  </p>

                  <div className="flex items-center justify-between text-[10px] text-edge-text-muted pt-1 border-t border-edge-border/40">
                    <span>Mood: {entry.emotionalState}</span>
                    {hasMistakes && (
                      <span className="text-edge-loss flex items-center space-x-1">
                        <AlertOctagon size={11} />
                        <span>Behavioral Leak</span>
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Detailed View */}
        <div className="lg:col-span-2">
          {selectedEntry ? (
            <div className="p-5 rounded-lg border border-edge-border bg-edge-surface space-y-5 font-mono text-xs shadow-terminal">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-edge-border">
                <div>
                  <span className="text-[10px] text-edge-text-muted uppercase">Session Journal</span>
                  <h2 className="text-base font-bold text-white uppercase">{selectedEntry.entryDate}</h2>
                </div>

                <div className="flex items-center space-x-2">
                  <div className="p-2 rounded bg-edge-surface-secondary border border-edge-border text-center">
                    <span className="block text-[8px] text-edge-text-muted uppercase">Preparation</span>
                    <span className="font-bold text-white">{selectedEntry.preparationScore}/10</span>
                  </div>
                  <div className="p-2 rounded bg-edge-surface-secondary border border-edge-border text-center">
                    <span className="block text-[8px] text-edge-text-muted uppercase">Execution</span>
                    <span className="font-bold text-white">{selectedEntry.executionScore}/10</span>
                  </div>
                  <div className="p-2 rounded bg-edge-accent/15 border border-edge-accent/30 text-center">
                    <span className="block text-[8px] text-edge-accent uppercase">Discipline</span>
                    <span className="font-bold text-edge-accent">{selectedEntry.disciplineScore}/10</span>
                  </div>
                </div>
              </div>

              {/* Psychology Warnings */}
              {(selectedEntry.fomoDetected ||
                selectedEntry.revengeTrading ||
                selectedEntry.overtrading ||
                selectedEntry.ignoredRules ||
                selectedEntry.movedStopLoss) && (
                <div className="p-3 rounded-lg border border-edge-loss/40 bg-edge-loss/10 space-y-1.5">
                  <div className="flex items-center space-x-1.5 text-edge-loss font-bold uppercase text-[11px]">
                    <AlertOctagon size={15} />
                    <span>Behavioral & Discipline Violations Flagged</span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[10px] text-white">
                    {selectedEntry.fomoDetected && <span className="bg-edge-loss/20 px-2 py-0.5 rounded">FOMO Entry</span>}
                    {selectedEntry.revengeTrading && <span className="bg-edge-loss/20 px-2 py-0.5 rounded">Revenge Trading</span>}
                    {selectedEntry.overtrading && <span className="bg-edge-loss/20 px-2 py-0.5 rounded">Overtrading</span>}
                    {selectedEntry.ignoredRules && <span className="bg-edge-loss/20 px-2 py-0.5 rounded">Ignored Trading Rules</span>}
                    {selectedEntry.movedStopLoss && <span className="bg-edge-loss/20 px-2 py-0.5 rounded">Moved Stop Loss</span>}
                  </div>
                </div>
              )}

              {/* Pre-Market Framework */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3 rounded border border-edge-border bg-edge-surface-secondary/40 space-y-1">
                  <span className="text-[10px] text-edge-accent uppercase font-bold tracking-wider">
                    Macro Backdrop & Catalysts
                  </span>
                  <p className="font-sans text-edge-text-secondary text-xs leading-relaxed">
                    {selectedEntry.macroEnvironment || 'No macro notes recorded.'}
                  </p>
                </div>

                <div className="p-3 rounded border border-edge-border bg-edge-surface-secondary/40 space-y-1">
                  <span className="text-[10px] text-edge-accent uppercase font-bold tracking-wider">
                    HTF Bias & Narrative
                  </span>
                  <p className="font-sans text-edge-text-secondary text-xs leading-relaxed">
                    {selectedEntry.higherTimeframeBias || 'No HTF notes recorded.'}
                  </p>
                </div>
              </div>

              {/* Trading Plan */}
              <div className="p-3.5 rounded border border-edge-border bg-edge-surface-secondary/20 space-y-1">
                <span className="text-[10px] text-white uppercase font-bold tracking-wider">
                  Session Trading Plan & Gameplan
                </span>
                <p className="font-sans text-edge-text-secondary text-xs leading-relaxed">
                  {selectedEntry.tradingPlan}
                </p>
              </div>

              {/* Post-Session Debrief */}
              <div className="p-3.5 rounded border border-edge-border bg-edge-surface-secondary/20 space-y-1">
                <span className="text-[10px] text-edge-profit uppercase font-bold tracking-wider">
                  Post-Session Debrief & Execution Summary
                </span>
                <p className="font-sans text-edge-text-secondary text-xs leading-relaxed">
                  {selectedEntry.dailySummary}
                </p>
              </div>

              {/* Key Lessons Learned */}
              <div className="p-3.5 rounded border border-edge-accent/30 bg-edge-accent/5 space-y-1">
                <span className="text-[10px] text-edge-accent uppercase font-bold tracking-wider">
                  Key Lesson & Rule Reinforcement
                </span>
                <p className="font-sans text-edge-text-secondary text-xs leading-relaxed">
                  {selectedEntry.lessonsLearned}
                </p>
              </div>
            </div>
          ) : (
            <div className="p-12 text-center text-edge-text-muted font-mono rounded-lg border border-edge-border">
              Select or record a journal entry to review daily debrief.
            </div>
          )}
        </div>
      </div>

      {/* New Journal Entry Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg border border-edge-border bg-edge-surface shadow-terminal p-5 space-y-4 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-edge-border pb-3">
              <h2 className="text-sm font-bold text-white uppercase">LOG DAILY TRADING JOURNAL</h2>
              <button onClick={() => setModalOpen(false)} className="text-edge-text-secondary hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-edge-text-muted uppercase mb-1">
                    Session Date
                  </label>
                  <input
                    type="date"
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                    className="w-full px-3 py-1.5 rounded bg-edge-surface-secondary border border-edge-border text-white outline-none focus:border-edge-accent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-edge-text-muted uppercase mb-1">
                    Dominant Emotional State
                  </label>
                  <select
                    value={emotionalState}
                    onChange={(e) => setEmotionalState(e.target.value as any)}
                    className="w-full px-3 py-1.5 rounded bg-edge-surface-secondary border border-edge-border text-white outline-none focus:border-edge-accent"
                  >
                    <option value="Disciplined">Disciplined</option>
                    <option value="Calm">Calm & Patient</option>
                    <option value="Neutral">Neutral</option>
                    <option value="Anxious">Anxious / Hesitant</option>
                    <option value="Euphoric">Euphoric (Post-Win High)</option>
                    <option value="Frustrated">Frustrated (Post-Loss)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-edge-text-muted uppercase mb-1">
                  Macro Backdrop & Economic Events
                </label>
                <input
                  type="text"
                  value={macroEnvironment}
                  onChange={(e) => setMacroEnvironment(e.target.value)}
                  className="w-full px-3 py-1.5 rounded bg-edge-surface-secondary border border-edge-border text-white outline-none focus:border-edge-accent"
                />
              </div>

              <div>
                <label className="block text-[10px] text-edge-text-muted uppercase mb-1">
                  Pre-Market Gameplan & Criteria
                </label>
                <textarea
                  rows={2}
                  value={tradingPlan}
                  onChange={(e) => setTradingPlan(e.target.value)}
                  className="w-full px-3 py-1.5 rounded bg-edge-surface-secondary border border-edge-border text-white font-sans text-xs outline-none focus:border-edge-accent"
                />
              </div>

              <div>
                <label className="block text-[10px] text-edge-profit uppercase mb-1">
                  Session Execution Summary
                </label>
                <textarea
                  rows={2}
                  value={dailySummary}
                  onChange={(e) => setDailySummary(e.target.value)}
                  placeholder="What happened? Did you execute according to your plan?"
                  className="w-full px-3 py-1.5 rounded bg-edge-surface-secondary border border-edge-border text-white font-sans text-xs outline-none focus:border-edge-accent"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] text-edge-accent uppercase mb-1">
                  Lessons Learned & Behavioral Takeaway
                </label>
                <textarea
                  rows={2}
                  value={lessonsLearned}
                  onChange={(e) => setLessonsLearned(e.target.value)}
                  placeholder="What can be improved for tomorrow?"
                  className="w-full px-3 py-1.5 rounded bg-edge-surface-secondary border border-edge-border text-white font-sans text-xs outline-none focus:border-edge-accent"
                />
              </div>

              {/* Psychology Toggles */}
              <div className="p-3 rounded border border-edge-border bg-edge-surface-secondary/30 space-y-2">
                <span className="block text-[10px] text-edge-loss font-bold uppercase tracking-wider">
                  Behavioral Pitfalls Audit
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={fomo}
                      onChange={(e) => setFomo(e.target.checked)}
                      className="rounded border-edge-border text-edge-accent"
                    />
                    <span className="text-[11px] text-edge-text-secondary">FOMO Experienced</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={revenge}
                      onChange={(e) => setRevenge(e.target.checked)}
                      className="rounded border-edge-border text-edge-accent"
                    />
                    <span className="text-[11px] text-edge-text-secondary">Revenge Trading</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={overtrade}
                      onChange={(e) => setOvertrade(e.target.checked)}
                      className="rounded border-edge-border text-edge-accent"
                    />
                    <span className="text-[11px] text-edge-text-secondary">Overtrading</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={movedSl}
                      onChange={(e) => setMovedSl(e.target.checked)}
                      className="rounded border-edge-border text-edge-accent"
                    />
                    <span className="text-[11px] text-edge-text-secondary">Moved Stop Loss</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ignoredRules}
                      onChange={(e) => setIgnoredRules(e.target.checked)}
                      className="rounded border-edge-border text-edge-accent"
                    />
                    <span className="text-[11px] text-edge-text-secondary">Ignored Plan/Rules</span>
                  </label>
                </div>
              </div>

              {/* Scores */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] text-edge-text-muted uppercase mb-1">
                    Discipline (1-10)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={disciplineScore}
                    onChange={(e) => setDisciplineScore(parseInt(e.target.value) || 8)}
                    className="w-full px-3 py-1.5 rounded bg-edge-surface-secondary border border-edge-border text-white outline-none focus:border-edge-accent"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-edge-text-muted uppercase mb-1">
                    Preparation (1-10)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={preparationScore}
                    onChange={(e) => setPreparationScore(parseInt(e.target.value) || 8)}
                    className="w-full px-3 py-1.5 rounded bg-edge-surface-secondary border border-edge-border text-white outline-none focus:border-edge-accent"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-edge-text-muted uppercase mb-1">
                    Execution (1-10)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={executionScore}
                    onChange={(e) => setExecutionScore(parseInt(e.target.value) || 8)}
                    className="w-full px-3 py-1.5 rounded bg-edge-surface-secondary border border-edge-border text-white outline-none focus:border-edge-accent"
                  />
                </div>
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
                  SAVE DEBRIEF
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
