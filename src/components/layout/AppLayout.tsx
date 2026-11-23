'use client';

import React, { useState, useEffect, ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { QuickTradeModal } from '../modals/QuickTradeModal';
import { NewAccountModal } from '../modals/NewAccountModal';
import { RiskAlertsDrawer } from '../modals/RiskAlertsDrawer';
import { CommandPalette } from './CommandPalette';
import { ShieldCheck } from 'lucide-react';

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
    <div className="min-h-screen bg-edge-bg text-edge-text-primary flex">
      {/* Sidebar */}
      <Sidebar onOpenQuickTrade={() => setQuickTradeOpen(true)} />

      {/* Main Content Area */}
      <div className="flex-1 ml-16 md:ml-60 flex flex-col min-h-screen transition-all duration-300">
        <Header
          onOpenQuickTrade={() => setQuickTradeOpen(true)}
          onOpenAlerts={() => setAlertsOpen(true)}
          onOpenNewAccount={() => setNewAccountOpen(true)}
          onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        />

        <main className="flex-1 p-4 md:p-6 overflow-x-hidden">
          {children}
        </main>

        {/* Institutional Regulatory & Risk Disclaimer Footer */}
        <footer className="p-4 border-t border-edge-border/50 bg-edge-surface/50 text-[11px] font-mono text-edge-text-muted">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
            <div className="flex items-center space-x-2">
              <span className="w-1.5 h-1.5 rounded-full bg-edge-accent shrink-0" />
              <p className="font-sans text-[11px] text-edge-text-secondary">
                <span className="font-mono font-bold text-white uppercase mr-1">DISCLAIMER:</span>
                EDGELEDGER is a trading management and risk analytics tool. It does not provide financial, tax, or legal advice, nor does it guarantee compliance with third-party prop-firm terms.
              </p>
            </div>
            <div className="shrink-0 flex items-center space-x-3 text-[10px] text-edge-text-muted">
              <span>Press <kbd className="px-1.5 py-0.5 rounded bg-edge-surface-secondary border border-edge-border text-edge-accent">⌘K</kbd> for command palette</span>
              <span>•</span>
              <span>v1.2.0 Institutional</span>
            </div>
          </div>
        </footer>
      </div>

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
