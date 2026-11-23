'use client';

import React, { useState } from 'react';
import { useTrading } from '../../context/TradingContext';
import {
  ChevronDown,
  Bell,
  Plus,
  ShieldCheck,
  ShieldAlert,
  RotateCcw,
  Wallet,
  TrendingUp,
  AlertTriangle
} from 'lucide-react';

interface HeaderProps {
  onOpenQuickTrade: () => void;
  onOpenAlerts: () => void;
  onOpenNewAccount: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenQuickTrade,
  onOpenAlerts,
  onOpenNewAccount
}) => {
  const {
    accounts,
    selectedAccountId,
    setSelectedAccountId,
    selectedAccount,
    portfolioMetrics,
    riskAlerts,
    resetToDemoData
  } = useTrading();

  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);
  const unreadAlerts = riskAlerts.filter((a) => !a.acknowledged);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(val);
  };

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-14 px-4 bg-edge-surface/90 backdrop-blur-md border-b border-edge-border">
      {/* Left: Account Selector Dropdown */}
      <div className="relative">
        <button
          onClick={() => setAccountDropdownOpen(!accountDropdownOpen)}
          className="flex items-center space-x-2.5 px-3 py-1.5 rounded border border-edge-border bg-edge-surface-secondary/70 hover:bg-edge-surface-secondary text-xs transition-colors"
        >
          <Wallet size={14} className="text-edge-accent" />
          <div className="flex flex-col text-left">
            <span className="font-semibold text-white truncate max-w-[180px]">
              {selectedAccountId === 'ALL' ? 'All Accounts (Portfolio)' : selectedAccount?.name}
            </span>
            <span className="text-[10px] text-edge-text-secondary font-mono">
              {selectedAccountId === 'ALL'
                ? `${accounts.length} Active Accounts`
                : `${selectedAccount?.brokerOrFirm} • ${selectedAccount?.challengePhase}`}
            </span>
          </div>
          <ChevronDown size={14} className="text-edge-text-secondary ml-1" />
        </button>

        {accountDropdownOpen && (
          <div
            className="absolute left-0 mt-2 w-72 rounded-md shadow-terminal bg-edge-surface border border-edge-border py-1 z-50 text-xs font-mono"
            onMouseLeave={() => setAccountDropdownOpen(false)}
          >
            <div className="px-3 py-2 text-[10px] text-edge-text-muted uppercase tracking-wider border-b border-edge-border flex justify-between items-center">
              <span>Switch Trading Desk</span>
              <button
                onClick={() => {
                  setAccountDropdownOpen(false);
                  onOpenNewAccount();
                }}
                className="text-edge-accent hover:underline flex items-center space-x-1"
              >
                <Plus size={10} />
                <span>New</span>
              </button>
            </div>

            <button
              onClick={() => {
                setSelectedAccountId('ALL');
                setAccountDropdownOpen(false);
              }}
              className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-edge-surface-secondary transition-colors ${
                selectedAccountId === 'ALL' ? 'bg-edge-accent/15 text-edge-accent font-semibold' : 'text-white'
              }`}
            >
              <div>
                <div className="font-medium">All Accounts (Consolidated)</div>
                <div className="text-[10px] text-edge-text-muted">Master Portfolio View</div>
              </div>
              <span className="tabular-nums font-semibold text-right">
                {formatCurrency(portfolioMetrics.totalEquity)}
              </span>
            </button>

            <div className="border-t border-edge-border my-1" />

            {accounts.map((acc) => (
              <button
                key={acc.id}
                onClick={() => {
                  setSelectedAccountId(acc.id);
                  setAccountDropdownOpen(false);
                }}
                className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-edge-surface-secondary transition-colors ${
                  selectedAccountId === acc.id ? 'bg-edge-accent/15 text-edge-accent font-semibold' : 'text-white'
                }`}
              >
                <div>
                  <div className="font-medium truncate max-w-[150px]">{acc.name}</div>
                  <div className="text-[10px] text-edge-text-muted">{acc.brokerOrFirm}</div>
                </div>
                <div className="text-right">
                  <div className="tabular-nums font-semibold">{formatCurrency(acc.currentEquity)}</div>
                  <div className="text-[9px] text-edge-text-muted uppercase">{acc.accountType.replace('_', ' ')}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Middle: Live Financial Ticker Bar */}
      <div className="hidden lg:flex items-center space-x-6 text-xs font-mono">
        {/* Today's P&L */}
        <div className="flex items-center space-x-2">
          <span className="text-edge-text-muted text-[11px] uppercase">Today P&L:</span>
          <span
            className={`font-semibold tabular-nums ${
              portfolioMetrics.todayPnl >= 0 ? 'text-edge-profit' : 'text-edge-loss'
            }`}
          >
            {portfolioMetrics.todayPnl >= 0 ? '+' : ''}
            {formatCurrency(portfolioMetrics.todayPnl)}
          </span>
        </div>

        {/* Total Equity */}
        <div className="flex items-center space-x-2 border-l border-edge-border pl-4">
          <span className="text-edge-text-muted text-[11px] uppercase">Equity:</span>
          <span className="font-semibold text-white tabular-nums">
            {formatCurrency(portfolioMetrics.totalEquity)}
          </span>
        </div>

        {/* Win Rate */}
        <div className="flex items-center space-x-2 border-l border-edge-border pl-4">
          <span className="text-edge-text-muted text-[11px] uppercase">Win Rate:</span>
          <span className="font-semibold text-white tabular-nums">
            {portfolioMetrics.winRate.toFixed(1)}%
          </span>
        </div>

        {/* Open Risk */}
        <div className="flex items-center space-x-2 border-l border-edge-border pl-4">
          <span className="text-edge-text-muted text-[11px] uppercase">Open Risk:</span>
          <span
            className={`font-semibold tabular-nums ${
              portfolioMetrics.openRiskUsd > 0 ? 'text-edge-warning' : 'text-edge-text-muted'
            }`}
          >
            {formatCurrency(portfolioMetrics.openRiskUsd)}
          </span>
        </div>

        {/* Rule Engine Status */}
        <div className="flex items-center space-x-1.5 border-l border-edge-border pl-4">
          {unreadAlerts.length > 0 ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-edge-warning/15 text-edge-warning border border-edge-warning/30">
              <AlertTriangle size={11} className="mr-1" />
              {unreadAlerts.length} RISK ALERTS
            </span>
          ) : (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-edge-profit/15 text-edge-profit border border-edge-profit/30">
              <ShieldCheck size={11} className="mr-1" />
              RULES IN COMPLIANCE
            </span>
          )}
        </div>
      </div>

      {/* Right Controls: Quick Trade, Alerts, Demo Reset */}
      <div className="flex items-center space-x-2.5">
        <button
          onClick={resetToDemoData}
          className="hidden md:flex items-center space-x-1 text-[11px] font-mono text-edge-text-muted hover:text-white px-2 py-1 rounded hover:bg-edge-surface-secondary border border-transparent hover:border-edge-border transition-colors"
          title="Reset to Demo Data"
        >
          <RotateCcw size={12} />
          <span>Reset Demo</span>
        </button>

        {/* Alerts Button */}
        <button
          onClick={onOpenAlerts}
          className="relative p-2 rounded text-edge-text-secondary hover:text-white hover:bg-edge-surface-secondary transition-colors border border-edge-border/50"
          title="Risk Alerts & Notifications"
        >
          <Bell size={16} />
          {unreadAlerts.length > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-edge-loss animate-pulse" />
          )}
        </button>

        {/* Quick Trade Entry */}
        <button
          onClick={onOpenQuickTrade}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-edge-accent text-edge-bg hover:bg-edge-accent-light font-mono text-xs font-semibold tracking-wide transition-colors shadow-subtle"
        >
          <Plus size={14} />
          <span>LOG TRADE</span>
        </button>
      </div>
    </header>
  );
};
