'use client';

import React, { useState, ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { QuickTradeModal } from '../modals/QuickTradeModal';
import { NewAccountModal } from '../modals/NewAccountModal';
import { RiskAlertsDrawer } from '../modals/RiskAlertsDrawer';

export const AppLayout: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [quickTradeOpen, setQuickTradeOpen] = useState(false);
  const [newAccountOpen, setNewAccountOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);

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
        />

        <main className="flex-1 p-4 md:p-6 overflow-x-hidden">
          {children}
        </main>
      </div>

      {/* Global Modals */}
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
