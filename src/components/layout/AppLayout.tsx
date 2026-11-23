'use client';

import React, { useState, useEffect, ReactNode } from 'react';
import { Header } from './Header';
import { QuickTradeModal } from '../modals/QuickTradeModal';
import { NewAccountModal } from '../modals/NewAccountModal';
import { RiskAlertsDrawer } from '../modals/RiskAlertsDrawer';
import { CommandPalette } from './CommandPalette';

export const AppLayout: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [quickTradeOpen, setQuickTradeOpen] = useState(false);
  const [newAccountOpen, setNewAccountOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

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
    <div className="min-h-screen w-full bg-[#050A0B] text-white flex flex-col font-sans selection:bg-[#9BF3DF] selection:text-[#03211C]">
      {/* 1. Tidewater Full-View Header with Horizontal Primary Navigation */}
      <Header
        onOpenQuickTrade={() => setQuickTradeOpen(true)}
        onOpenAlerts={() => setAlertsOpen(true)}
        onOpenNewAccount={() => setNewAccountOpen(true)}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
      />

      {/* 2. Full-View Main Canvas */}
      <main className="flex-1 w-full max-w-[1600px] mx-auto px-4 sm:px-8 py-6 overflow-x-hidden">
        {children}
      </main>

      {/* 3. Institutional Regulatory & Risk Disclaimer Footer */}
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

      {/* 4. Global Modals & Command Palette */}
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
