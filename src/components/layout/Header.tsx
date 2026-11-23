'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTrading } from '../../context/TradingContext';
import {
  ChevronDown,
  Plus,
  ShieldCheck,
  RotateCcw,
  Wallet,
  AlertTriangle,
  Menu,
  X,
  LayoutDashboard,
  ArrowLeftRight,
  TrendingUp,
  BarChart3,
  BookOpen,
  Calendar,
  ShieldAlert,
  FileText,
  Settings
} from 'lucide-react';

interface HeaderProps {
  onOpenQuickTrade: () => void;
  onOpenAlerts: () => void;
  onOpenNewAccount: () => void;
  onOpenCommandPalette?: () => void;
}

const PRIMARY_NAV = [
  { name: 'Overview', href: '/' },
  { name: 'Accounts', href: '/accounts' },
  { name: 'Trades', href: '/trades' },
  { name: 'Analytics', href: '/analytics' },
  { name: 'Risk', href: '/risk' },
  { name: 'Journal', href: '/journal' },
  { name: 'Calendar', href: '/calendar' },
  { name: 'Strategies', href: '/strategies' },
  { name: 'Reports', href: '/reports' },
  { name: 'Settings', href: '/settings' },
];

export const Header: React.FC<HeaderProps> = ({
  onOpenQuickTrade,
  onOpenAlerts,
  onOpenNewAccount,
  onOpenCommandPalette
}) => {
  const pathname = usePathname();
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const unreadAlerts = riskAlerts.filter((a) => !a.acknowledged);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(val);
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-[#050A0B]/95 backdrop-blur-md border-b border-[#34544F]">
      <div className="w-full px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
        {/* 1. Left: Brand Mark & Title */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5 group">
            <span
              className="grid place-items-center w-8 h-8 rounded-[58%_42%_46%_54%_/_52%_48%_52%_48%] font-sans font-bold text-sm text-white transition-transform group-hover:scale-105 shadow-sm"
              style={{ background: 'var(--tw-hero)' }}
              aria-hidden="true"
            >
              E
            </span>
            <div className="flex flex-col">
              <span className="font-sans font-bold text-base text-white tracking-tight flex items-center gap-1.5">
                <span>EdgeLedger</span>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-[#13211F] text-[#9BF3DF] border border-[#34544F]">
                  PRO
                </span>
              </span>
            </div>
          </Link>

          {/* 2. Center: Primary Horizontal Nav Pills (Tidewater Style) */}
          <nav aria-label="Primary" className="hidden xl:flex items-center gap-1 p-1 rounded-full bg-[#13211F] border border-[#34544F] font-sans text-xs">
            {PRIMARY_NAV.map((item) => {
              const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex items-center h-7 px-3.5 rounded-full transition-all ${
                    isActive
                      ? 'bg-[#0B1415] text-white font-semibold shadow-sm border border-[#4F7470]'
                      : 'text-[#CFE2DE] hover:text-white hover:bg-white/5'
                  }`}
                >
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* 3. Center-Right: Live Financial Ticker */}
        <div className="hidden 2xl:flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-[#A9C1BD] uppercase">Today:</span>
            <span className={`font-semibold tabular-nums ${portfolioMetrics.todayPnl >= 0 ? 'text-[#5BE6AE]' : 'text-[#FF8F80]'}`}>
              {portfolioMetrics.todayPnl >= 0 ? '+' : ''}{formatCurrency(portfolioMetrics.todayPnl)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 border-l border-[#34544F] pl-4">
            <span className="text-[10px] text-[#A9C1BD] uppercase">Equity:</span>
            <span className="font-semibold text-white tabular-nums">
              {formatCurrency(portfolioMetrics.totalEquity)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 border-l border-[#34544F] pl-4">
            <span className="text-[10px] text-[#A9C1BD] uppercase">Open Risk:</span>
            <span className={`font-semibold tabular-nums ${portfolioMetrics.openRiskUsd > 0 ? 'text-[#FFB86B]' : 'text-[#A9C1BD]'}`}>
              {formatCurrency(portfolioMetrics.openRiskUsd)}
            </span>
          </div>
        </div>

        {/* 4. Right: Tools & Action Controls */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Risk Alert Pill */}
          <button
            onClick={onOpenAlerts}
            className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-xs font-mono font-semibold transition-all cursor-pointer ${
              unreadAlerts.length > 0
                ? 'bg-[rgba(255,184,107,0.15)] text-[#FFB86B] border border-[rgba(255,184,107,0.6)] shadow-sm'
                : 'bg-[#13211F] text-[#CFE2DE] hover:text-white border border-[#34544F]'
            }`}
            title="Open Risk Alerts Drawer"
          >
            {unreadAlerts.length > 0 ? (
              <>
                <span className="w-2 h-2 rounded-full bg-[#FFB86B] animate-pulse" />
                <span>{unreadAlerts.length} risk alert{unreadAlerts.length > 1 ? 's' : ''}</span>
              </>
            ) : (
              <>
                <ShieldCheck size={13} className="text-[#5BE6AE]" />
                <span className="hidden sm:inline">Rules Safe</span>
              </>
            )}
          </button>

          {/* Desk Selector Button & Dropdown */}
          <div className="relative">
            <button
              onClick={() => setAccountDropdownOpen(!accountDropdownOpen)}
              className="inline-flex items-center gap-2 h-8 px-3 rounded-full bg-[#0B1415] hover:bg-[#13211F] border border-[#34544F] text-xs font-mono text-white transition-all cursor-pointer"
            >
              <Wallet size={13} className="text-[#FFD56B]" />
              <span className="font-semibold truncate max-w-[120px] sm:max-w-[150px]">
                {selectedAccountId === 'ALL' ? `All accounts · ${accounts.length}` : selectedAccount?.name}
              </span>
              <ChevronDown size={13} className="text-[#A9C1BD]" />
            </button>

            {accountDropdownOpen && (
              <div
                className="absolute right-0 mt-2 w-72 rounded-2xl shadow-2xl bg-[#0B1415] border border-[#34544F] p-2 z-50 text-xs font-mono"
                onMouseLeave={() => setAccountDropdownOpen(false)}
              >
                <div className="px-3 py-2 text-[10px] text-[#A9C1BD] uppercase tracking-wider border-b border-[#34544F] flex justify-between items-center">
                  <span>Switch Trading Desk</span>
                  <button
                    onClick={() => {
                      setAccountDropdownOpen(false);
                      onOpenNewAccount();
                    }}
                    className="text-[#9BF3DF] hover:underline flex items-center gap-1 font-bold"
                  >
                    <Plus size={11} />
                    <span>New</span>
                  </button>
                </div>

                <button
                  onClick={() => {
                    setSelectedAccountId('ALL');
                    setAccountDropdownOpen(false);
                  }}
                  className={`w-full text-left p-2.5 rounded-xl flex items-center justify-between transition-colors mt-1 ${
                    selectedAccountId === 'ALL'
                      ? 'bg-[#13211F] text-[#9BF3DF] font-bold border border-[#4F7470]'
                      : 'text-white hover:bg-[#13211F]'
                  }`}
                >
                  <div>
                    <div className="font-bold">All Accounts (Consolidated)</div>
                    <div className="text-[10px] text-[#A9C1BD]">Master Portfolio View</div>
                  </div>
                  <span className="tabular-nums font-bold text-right text-[#5BE6AE]">
                    {formatCurrency(portfolioMetrics.totalEquity)}
                  </span>
                </button>

                <div className="border-t border-[#34544F] my-1" />

                <div className="space-y-1 max-h-56 overflow-y-auto">
                  {accounts.map((acc) => (
                    <button
                      key={acc.id}
                      onClick={() => {
                        setSelectedAccountId(acc.id);
                        setAccountDropdownOpen(false);
                      }}
                      className={`w-full text-left p-2.5 rounded-xl flex items-center justify-between transition-colors ${
                        selectedAccountId === acc.id
                          ? 'bg-[#13211F] text-[#9BF3DF] font-bold border border-[#4F7470]'
                          : 'text-white hover:bg-[#13211F]'
                      }`}
                    >
                      <div>
                        <div className="font-semibold truncate max-w-[130px]">{acc.name}</div>
                        <div className="text-[10px] text-[#A9C1BD]">{acc.brokerOrFirm}</div>
                      </div>
                      <div className="text-right">
                        <div className="tabular-nums font-bold">{formatCurrency(acc.currentEquity)}</div>
                        <div className="text-[9px] text-[#A9C1BD] uppercase">{acc.challengePhase}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Command Search Pill */}
          {onOpenCommandPalette && (
            <button
              onClick={onOpenCommandPalette}
              className="hidden sm:inline-flex items-center gap-2 h-8 px-3 rounded-full border border-[#34544F] bg-[#0B1415] hover:bg-[#13211F] text-xs font-sans text-[#CFE2DE] hover:text-white transition-all cursor-pointer"
              title="Open Command Palette (Cmd + K)"
            >
              <span>Search</span>
              <kbd className="px-1.5 py-0.5 rounded-md bg-[#13211F] border border-[#34544F] text-[10px] font-mono text-[#A9C1BD]">
                ⌘K
              </kbd>
            </button>
          )}

          {/* Reset Demo Quick Button */}
          <button
            onClick={resetToDemoData}
            className="hidden lg:inline-flex items-center justify-center w-8 h-8 rounded-full border border-[#34544F] bg-[#0B1415] hover:bg-[#13211F] text-[#A9C1BD] hover:text-white transition-all cursor-pointer"
            title="Reset to Initial Demo Data"
          >
            <RotateCcw size={13} />
          </button>

          {/* Primary + LOG TRADE Action */}
          <button
            onClick={onOpenQuickTrade}
            className="inline-flex items-center justify-center gap-1.5 h-8 px-3.5 rounded-full bg-white text-[#0B1415] hover:bg-gray-100 font-sans font-bold text-xs transition-all shadow-sm cursor-pointer"
          >
            <Plus size={14} />
            <span>+ LOG TRADE</span>
          </button>

          {/* Mobile Menu Hamburger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="xl:hidden inline-flex items-center justify-center w-8 h-8 rounded-full border border-[#34544F] bg-[#13211F] text-white"
            aria-label="Toggle Navigation"
          >
            {mobileMenuOpen ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Navigation Menu */}
      {mobileMenuOpen && (
        <div className="xl:hidden border-t border-[#34544F] bg-[#0B1415] p-4 space-y-2 animate-fade-in">
          <div className="grid grid-cols-2 gap-2 font-mono text-xs pb-3 border-b border-[#34544F]">
            <div className="p-2 rounded-xl bg-[#13211F]">
              <div className="text-[10px] text-[#A9C1BD] uppercase">Today P&amp;L</div>
              <div className="font-bold text-white">{formatCurrency(portfolioMetrics.todayPnl)}</div>
            </div>
            <div className="p-2 rounded-xl bg-[#13211F]">
              <div className="text-[10px] text-[#A9C1BD] uppercase">Total Equity</div>
              <div className="font-bold text-white">{formatCurrency(portfolioMetrics.totalEquity)}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1 font-sans text-xs">
            {PRIMARY_NAV.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`p-2.5 rounded-xl text-center font-medium transition-colors ${
                    isActive
                      ? 'bg-[#9BF3DF] text-[#03211C] font-bold'
                      : 'bg-[#13211F] text-[#CFE2DE] hover:text-white'
                  }`}
                >
                  {item.name}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
};
