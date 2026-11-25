'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTrading } from '../../context/TradingContext';
import { useSessionSync } from '../../context/SessionSyncContext';
import { EdgeLedgerLogo } from '../ui/EdgeLedgerLogo';
import { SyncStatusChip } from '../sync/SyncStatusChip';
import { ChevronDown, Check, Plus, ExternalLink, Sun, Moon, Eye, EyeOff, Lock, LogOut } from 'lucide-react';

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

const MORE_NAV = [
  { name: 'Strategies', href: '/strategies' },
  { name: 'Analytics', href: '/analytics' },
  { name: 'Settings', href: '/settings' },
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
    isPnlHidden,
    setIsPnlHidden,
  } = useTrading();
  const { sessionSnapshot, lockSession, requestSignOut } = useSessionSync();

  const [isHeaderScanning, setIsHeaderScanning] = useState(false);

  const handleHeaderFingerprintClick = () => {
    if (!isPnlHidden) {
      setIsPnlHidden(true);
      return;
    }
    setIsHeaderScanning(true);
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([25, 40, 25]);
      } catch {}
    }
    setTimeout(() => {
      setIsHeaderScanning(false);
      setIsPnlHidden(false);
    }, 550);
  };

  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);
  const [moreNavOpen, setMoreNavOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const moreNavRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setAccountDropdownOpen(false);
      }
      if (moreNavRef.current && !moreNavRef.current.contains(e.target as Node)) {
        setMoreNavOpen(false);
      }
    };
    if (accountDropdownOpen || moreNavOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [accountDropdownOpen, moreNavOpen]);

  const activeDeskLabel =
    selectedAccountId === 'ALL'
      ? `All accounts, ${accounts.length}`
      : selectedAccount?.name || `All accounts, ${accounts.length}`;

  return (
    <header className="tw-top">
      {/* 1. Brand Mark & Title */}
      <Link href="/" className="tw-brand shrink-0">
        <span className="tw-mark" aria-hidden="true">
          <EdgeLedgerLogo size={26} />
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

        <div className="relative" ref={moreNavRef}>
          <button
            type="button"
            onClick={() => setMoreNavOpen((prev) => !prev)}
            aria-expanded={moreNavOpen}
            aria-haspopup="menu"
            className={`inline-flex items-center gap-1 h-8 px-1.5 rounded-full text-[13px] font-medium whitespace-nowrap transition-colors ${
              MORE_NAV.some((m) => pathname.startsWith(m.href))
                ? 'bg-[var(--tw-tile)] text-[var(--tw-ink)] font-semibold'
                : 'text-[var(--tw-ink-2)] hover:text-[var(--tw-ink)]'
            }`}
          >
            <span>More</span>
            <ChevronDown size={12} />
          </button>

          {moreNavOpen && (
            <div
              role="menu"
              className="absolute left-0 mt-2 w-44 rounded-2xl bg-[var(--tw-tile)] border border-[var(--tw-line-strong)] shadow-2xl p-1.5 z-50"
            >
              {MORE_NAV.map((item) => {
                const isActive = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    role="menuitem"
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => setMoreNavOpen(false)}
                    className={`block px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-[var(--tw-pill)] text-[var(--tw-ink)] font-semibold'
                        : 'text-[var(--tw-ink-2)] hover:bg-[var(--tw-pill)] hover:text-[var(--tw-ink)]'
                    }`}
                  >
                    {item.name}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
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
            <span className="truncate max-w-[70px]">{activeDeskLabel}</span>
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
                          {acc.brokerOrFirm} · {isPnlHidden ? '$••••••' : `$${acc.currentBalance.toLocaleString('en-US')}`}
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

        {/* Biometric P&L Privacy Toggle */}
        <button
          className={`tw-btn quiet shrink-0 !w-[34px] !px-0 justify-center tw-fp-head ${isPnlHidden ? 'tw-fp-head-locked' : 'tw-fp-head-unlocked'}`}
          type="button"
          onClick={handleHeaderFingerprintClick}
          title={isPnlHidden ? 'P&L is Hidden (Click fingerprint to verify & reveal)' : 'P&L is Visible (Click to lock & hide)'}
          aria-label={isPnlHidden ? 'Unlock P&L with Fingerprint' : 'Hide P&L'}
        >
          <div className="relative flex items-center justify-center">
            {isPnlHidden ? (
              <EyeOff
                size={14}
                className="text-[#FFD56B]"
              />
            ) : (
              <Eye
                size={14}
                className="text-[#5BE6AE]"
              />
            )}
            {isHeaderScanning && <span className="tw-fp-laser" />}
          </div>
        </button>

        {/* Theme Toggle Button */}
        {onToggleTheme && (
          <button
            className="tw-btn quiet shrink-0 !w-[34px] !px-0 justify-center"
            type="button"
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'Switch to Light theme' : 'Switch to Dark theme'}
            aria-label={theme === 'dark' ? 'Switch to Light theme' : 'Switch to Dark theme'}
          >
            {theme === 'dark' ? <Sun size={14} className="text-[#FFD56B]" /> : <Moon size={14} className="text-[#0A4D4C]" />}
          </button>
        )}

        {/* Live Sync & Auth Status Chip */}
        <SyncStatusChip compact />

        {sessionSnapshot.state !== 'signedOut' && (
          <>
            <button
              className="tw-btn quiet shrink-0 !w-[34px] !px-0 justify-center"
              type="button"
              onClick={lockSession}
              title="Lock session UI"
              aria-label="Lock session UI"
            >
              <Lock size={14} aria-hidden="true" />
            </button>
            <button
              className="tw-btn quiet shrink-0 !w-[34px] !px-0 justify-center"
              type="button"
              onClick={() => void requestSignOut()}
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut size={14} aria-hidden="true" />
            </button>
          </>
        )}

        {/* Search / Command Palette Button */}
        <button
          className="tw-btn quiet shrink-0 !w-[38px] !px-0 justify-center"
          type="button"
          onClick={onOpenCommandPalette}
          title="Search or command palette (⌘K)"
          aria-label="Search or command palette"
        >
          <kbd>⌘K</kbd>
        </button>
      </div>
    </header>
  );
};
