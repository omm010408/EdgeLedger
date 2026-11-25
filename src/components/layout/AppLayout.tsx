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
  const isStaticBoard =
    pathname === '/' ||
    pathname === '/calendar' ||
    pathname === '/journal' ||
    pathname === '/risk' ||
    pathname === '/reports' ||
    pathname === '/strategies' ||
    pathname === '/analytics' ||
    pathname === '/settings';

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
      {isStaticBoard ? (
        /* Full Tidewater Board Canvas (Overview, Calendar, Journal, and Risk) */
        <div
          className={`tw-board ${
            pathname === '/calendar' || pathname === '/journal' ? 'tw-board-static' : ''
          } ${
            pathname === '/risk' ||
            pathname === '/reports' ||
            pathname === '/strategies' ||
            pathname === '/analytics' ||
            pathname === '/settings'
              ? 'tw-board-scrollable'
              : ''
          }`}
        >
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
          <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-7 relative overflow-x-clip">
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

          <main className="flex-1 w-full max-w-[1600px] mx-auto px-4 sm:px-8 pt-6 pb-10 overflow-x-hidden">
            {children}
          </main>
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
