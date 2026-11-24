'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTrading } from '../../context/TradingContext';
import { ChevronDown, Check, Plus, ExternalLink, Sun, Moon } from 'lucide-react';

interface HeaderProps {
  onOpenQuickTrade: () => void;
  onOpenAlerts: () => void;
  onOpenNewAccount: () => void;
  onOpenCommandPalette?: () => void;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
}

const PRIMARY_NAV = [
  { name: 'Overview', href: '/' },
  { name: 'Accounts', href: '/accounts' },
  { name: 'Trades', href: '/trades' },
  { name: 'Calendar', href: '/calendar' },
  { name: 'Journal', href: '/journal' },
  { name: 'Risk', href: '/risk' },
  { name: 'Reports', href: '/reports' },
];

export const Header: React.FC<HeaderProps> = ({
  onOpenQuickTrade,
  onOpenAlerts,
  onOpenNewAccount,
  onOpenCommandPalette,
  theme = 'dark',
  onToggleTheme,
}) => {
  const pathname = usePathname();
  const {
    accounts,
    selectedAccountId,
    setSelectedAccountId,
    selectedAccount,
    periodFilter,
    setPeriodFilter,
  } = useTrading();

  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setAccountDropdownOpen(false);
      }
    };
    if (accountDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [accountDropdownOpen]);

  const activeDeskLabel =
    selectedAccountId === 'ALL'
      ? `All accounts, ${accounts.length}`
      : selectedAccount?.name || `All accounts, ${accounts.length}`;

  return (
    <header className="tw-top">
      {/* 1. Brand Mark & Title */}
      <Link href="/" className="tw-brand">
        <span className="tw-mark" aria-hidden="true">
          E
        </span>
        <span>EdgeLedger</span>
      </Link>

      {/* 2. Primary Navigation */}
      <nav className="tw-nav" aria-label="Primary">
        {PRIMARY_NAV.map((item) => {
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
            >
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* 3. Right Tools: Period Segmented Control, Desk Selector & Search */}
      <div className="tw-tools">
        {/* Period Segmented Control */}
        <div className="tw-seg" role="group" aria-label="Period">
          {(['Week', 'Month', 'All time'] as const).map((period) => (
            <button
              key={period}
              type="button"
              aria-pressed={periodFilter === period}
              onClick={() => setPeriodFilter(period)}
            >
              {period}
            </button>
          ))}
        </div>

        {/* Desk / Account Selector */}
        <div className="relative" ref={dropdownRef}>
          <button
            className="tw-btn"
            type="button"
            onClick={() => setAccountDropdownOpen(!accountDropdownOpen)}
            aria-expanded={accountDropdownOpen}
            aria-haspopup="listbox"
          >
            <span className="truncate max-w-[120px] sm:max-w-none">{activeDeskLabel}</span>
            <ChevronDown size={13} className="opacity-70 shrink-0" />
          </button>

          {accountDropdownOpen && (
            <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-[#0B1415] border border-[#34544F] shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="px-3 py-1.5 text-[11px] font-mono text-[#A9C1BD] uppercase tracking-wider border-b border-[#34544F]/60">
                Select Active Desk
              </div>

              <div className="py-1 space-y-0.5" role="listbox">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedAccountId('ALL');
                    setAccountDropdownOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-sans transition-all text-left ${
                    selectedAccountId === 'ALL'
                      ? 'bg-[#13211F] text-white font-semibold border border-[#4F7470]'
                      : 'text-[#CFE2DE] hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <div className="flex flex-col">
                    <span className="font-medium">All accounts (Consolidated)</span>
                    <span className="text-[11px] text-[#A9C1BD] font-mono">{accounts.length} linked accounts</span>
                  </div>
                  {selectedAccountId === 'ALL' && <Check size={14} className="text-[#9BF3DF]" />}
                </button>

                {accounts.map((acc) => {
                  const isSelected = selectedAccountId === acc.id;
                  return (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => {
                        setSelectedAccountId(acc.id);
                        setAccountDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-sans transition-all text-left ${
                        isSelected
                          ? 'bg-[#13211F] text-white font-semibold border border-[#4F7470]'
                          : 'text-[#CFE2DE] hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className="font-medium truncate max-w-[180px]">{acc.name}</span>
                        <span className="text-[11px] text-[#A9C1BD] font-mono">
                          {acc.brokerOrFirm} · ${acc.currentBalance.toLocaleString('en-US')}
                        </span>
                      </div>
                      {isSelected && <Check size={14} className="text-[#9BF3DF]" />}
                    </button>
                  );
                })}
              </div>

              <div className="pt-1.5 mt-1 border-t border-[#34544F]/60 flex items-center justify-between px-1 text-xs">
                <Link
                  href="/accounts"
                  onClick={() => setAccountDropdownOpen(false)}
                  className="flex items-center gap-1.5 text-[#9BF3DF] hover:underline px-2 py-1 text-[11px] font-medium"
                >
                  <span>Manage Accounts</span>
                  <ExternalLink size={11} />
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setAccountDropdownOpen(false);
                    onOpenNewAccount();
                  }}
                  className="flex items-center gap-1 text-[#CFE2DE] hover:text-white px-2 py-1 text-[11px] font-medium"
                >
                  <Plus size={12} />
                  <span>New</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Theme Toggle Button */}
        {onToggleTheme && (
          <button
            className="tw-btn quiet"
            type="button"
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'Switch to Light theme' : 'Switch to Dark theme'}
            aria-label="Toggle color theme"
          >
            {theme === 'dark' ? <Sun size={14} className="text-[#FFD56B]" /> : <Moon size={14} className="text-[#0A4D4C]" />}
            <span className="hidden sm:inline text-xs">{theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>
        )}

        {/* Search / Command Palette Button */}
        <button
          className="tw-btn quiet"
          type="button"
          onClick={onOpenCommandPalette}
          title="Search or command palette (⌘K)"
        >
          <span>Search</span>
          <kbd>⌘K</kbd>
        </button>
      </div>
    </header>
  );
};
