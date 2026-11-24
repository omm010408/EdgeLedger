'use client';

import React, { useState, useEffect, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Header } from './Header';
import { QuickTradeModal } from '../modals/QuickTradeModal';
import { NewAccountModal } from '../modals/NewAccountModal';
import { RiskAlertsDrawer } from '../modals/RiskAlertsDrawer';
import { CommandPalette } from './CommandPalette';

export const AppLayout: React.FC<{ children: ReactNode }> = ({ children }) => {
  const pathname = usePathname();
  const isOverview = pathname === '/';

  const [quickTradeOpen, setQuickTradeOpen] = useState(false);
  const [newAccountOpen, setNewAccountOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Load theme from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('edgeledger_theme') as 'dark' | 'light';
    if (saved) {
      setTheme(saved);
      document.documentElement.setAttribute('data-theme', saved);
    }
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('edgeledger_theme', next);
    document.documentElement.setAttribute('data-theme', next);
  };

  // Global Cmd+K / Ctrl+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div
      data-theme={theme}
      className={`min-h-screen w-full bg-[var(--tw-bg)] text-[var(--tw-ink)] flex flex-col font-sans selection:bg-[#9BF3DF] selection:text-[#03211C] ${theme}`}
    >
      {isOverview ? (
        /* Overview Page: Exact Tidewater 1080p Board Canvas */
        <div className="tw-board">
          {/* Ambient Tidal Ripple in top-right */}
          <svg className="tw-ripple" viewBox="0 0 600 600" aria-hidden="true">
            <circle cx="300" cy="300" r="120" />
            <circle cx="300" cy="300" r="200" />
            <circle cx="300" cy="300" r="280" />
          </svg>

          {/* Tidewater Top Header */}
          <Header
            onOpenQuickTrade={() => setQuickTradeOpen(true)}
            onOpenAlerts={() => setAlertsOpen(true)}
            onOpenNewAccount={() => setNewAccountOpen(true)}
            onOpenCommandPalette={() => setCommandPaletteOpen(true)}
            theme={theme}
            onToggleTheme={toggleTheme}
          />

          {/* Bento Grid Canvas */}
          {children}
        </div>
      ) : (
        /* Standard Pages (Trades, Accounts, Journal, Risk, Reports, Settings) */
        <>
          <div className="w-full max-w-[1440px] mx-auto px-7 relative">
            <svg className="tw-ripple" viewBox="0 0 600 600" aria-hidden="true">
              <circle cx="300" cy="300" r="120" />
              <circle cx="300" cy="300" r="200" />
              <circle cx="300" cy="300" r="280" />
            </svg>
            <Header
              onOpenQuickTrade={() => setQuickTradeOpen(true)}
              onOpenAlerts={() => setAlertsOpen(true)}
              onOpenNewAccount={() => setNewAccountOpen(true)}
              onOpenCommandPalette={() => setCommandPaletteOpen(true)}
              theme={theme}
              onToggleTheme={toggleTheme}
            />
          </div>

          <main className="flex-1 w-full max-w-[1600px] mx-auto px-4 sm:px-8 py-6 overflow-x-hidden">
            {children}
          </main>

          {/* Institutional Regulatory & Risk Disclaimer Footer */}
          <footer className="w-full py-5 px-4 sm:px-8 border-t border-[#34544F] bg-[#0B1415]/60 text-xs font-mono text-[#A9C1BD]">
            <div className="max-w-[1600px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
              <div className="flex items-center space-x-2">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: 'var(--tw-hero-line)' }}
                />
                <p className="font-sans text-xs text-[#CFE2DE]">
                  <span className="font-mono font-bold text-white uppercase mr-1">DISCLAIMER:</span>
                  EDGELEDGER is a quantitative trading performance intelligence and record-keeping tool. It does not provide investment, financial, legal, or tax advice, nor does it guarantee compliance with third-party prop-firm terms.
                </p>
              </div>
              <div className="shrink-0 flex items-center space-x-3 text-[11px] text-[#A9C1BD]">
                <span>Press <kbd className="px-1.5 py-0.5 rounded-md bg-[#13211F] border border-[#34544F] text-[#9BF3DF] font-mono">⌘K</kbd> for command palette</span>
                <span>•</span>
                <span>v1.3.0 Institutional Bento</span>
              </div>
            </div>
          </footer>
        </>
      )}

      {/* Global Modals & Command Palette */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onOpenQuickTrade={() => setQuickTradeOpen(true)}
        onOpenNewAccount={() => setNewAccountOpen(true)}
      />

      <QuickTradeModal
        isOpen={quickTradeOpen}
        onClose={() => setQuickTradeOpen(false)}
      />

      <NewAccountModal
        isOpen={newAccountOpen}
        onClose={() => setNewAccountOpen(false)}
      />

      <RiskAlertsDrawer
        isOpen={alertsOpen}
        onClose={() => setAlertsOpen(false)}
      />
    </div>
  );
};
