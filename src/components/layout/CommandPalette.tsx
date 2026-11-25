'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTrading } from '../../context/TradingContext';
import {
  Search,
  Command,
  LayoutDashboard,
  Wallet,
  ArrowLeftRight,
  TrendingUp,
  BarChart3,
  BookOpen,
  Calendar,
  ShieldAlert,
  FileText,
  Settings,
  Plus,
  ArrowRight,
  X
} from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenQuickTrade: () => void;
  onOpenNewAccount: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onOpenQuickTrade,
  onOpenNewAccount,
}) => {
  const router = useRouter();
  const { accounts, setSelectedAccountId, trades } = useTrading();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const navCommands = [
    { label: 'Go to Overview', icon: LayoutDashboard, action: () => router.push('/') },
    { label: 'Go to Accounts Desk', icon: Wallet, action: () => router.push('/accounts') },
    { label: 'Go to Trades Ledger', icon: ArrowLeftRight, action: () => router.push('/trades') },
    { label: 'Go to Strategies Playbook', icon: TrendingUp, action: () => router.push('/strategies') },
    { label: 'Go to Analytics Engine', icon: BarChart3, action: () => router.push('/analytics') },
    { label: 'Go to Trading Journal', icon: BookOpen, action: () => router.push('/journal') },
    { label: 'Go to Trading Calendar', icon: Calendar, action: () => router.push('/calendar') },
    { label: 'Go to Risk Terminal', icon: ShieldAlert, action: () => router.push('/risk') },
    { label: 'Go to Reports & Imports', icon: FileText, action: () => router.push('/reports') },
    { label: 'Go to Terminal Settings', icon: Settings, action: () => router.push('/settings') },
  ];

  const actionCommands = [
    {
      label: 'Record New Trade Execution',
      icon: Plus,
      action: () => {
        onClose();
        onOpenQuickTrade();
      },
    },
    {
      label: 'Provision New Trading Desk Account',
      icon: Plus,
      action: () => {
        onClose();
        onOpenNewAccount();
      },
    },
  ];

  const accountCommands = [
    {
      label: 'Focus: All Desks (Consolidated)',
      icon: Wallet,
      action: () => {
        setSelectedAccountId('ALL');
        onClose();
      },
    },
    ...accounts.map((acc) => ({
      label: `Focus: ${acc.name} (${acc.brokerOrFirm})`,
      icon: Wallet,
      action: () => {
        setSelectedAccountId(acc.id);
        onClose();
      },
    })),
  ];

  const allItems = [
    ...actionCommands.map((c) => ({ ...c, category: 'Actions' })),
    ...accountCommands.map((c) => ({ ...c, category: 'Desk Switching' })),
    ...navCommands.map((c) => ({ ...c, category: 'Navigation' })),
  ];

  const filteredItems = query.trim() === ''
    ? allItems
    : allItems.filter((i) => i.label.toLowerCase().includes(query.toLowerCase()));

  const handleSelect = (item: (typeof allItems)[0]) => {
    item.action();
    onClose();
  };

  // Close on Escape, toggle on Cmd/Ctrl+K, and handle Arrow/Enter navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) {
          onClose();
        }
        return;
      }
      if (!isOpen) return;
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown' && filteredItems.length > 0) {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredItems.length);
      } else if (e.key === 'ArrowUp' && filteredItems.length > 0) {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % filteredItems.length);
      } else if (e.key === 'Enter' && filteredItems[selectedIndex]) {
        e.preventDefault();
        handleSelect(filteredItems[selectedIndex]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, filteredItems, selectedIndex]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-lg border border-edge-border bg-edge-surface shadow-terminal overflow-hidden text-xs font-mono"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center px-3 py-3 border-b border-edge-border bg-edge-surface-secondary/50">
          <Search size={16} className="text-edge-accent mr-2.5 shrink-0" />
          <input
            autoFocus
            type="text"
            placeholder="Type a command, desk name, or jump to page... (ESC to exit)"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            className="w-full bg-transparent text-white placeholder-edge-text-muted outline-none text-xs"
          />
          <kbd className="px-1.5 py-0.5 rounded bg-edge-surface border border-edge-border text-[10px] text-edge-text-muted">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-72 overflow-y-auto p-2 space-y-1">
          {filteredItems.length === 0 ? (
            <div className="py-8 text-center text-edge-text-muted">
              No matching commands or accounts found.
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const Icon = item.icon;
              const isSelected = idx === selectedIndex;

              return (
                <button
                  key={`${item.category}-${item.label}`}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full text-left px-3 py-2 rounded flex items-center justify-between transition-colors ${
                    isSelected
                      ? 'bg-edge-accent/15 text-white border border-edge-accent/40'
                      : 'text-edge-text-secondary hover:text-white border border-transparent'
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <Icon
                      size={15}
                      className={isSelected ? 'text-edge-accent' : 'text-edge-text-muted'}
                    />
                    <span className="font-medium">{item.label}</span>
                  </div>
                  <span className="text-[9px] uppercase tracking-wider text-edge-text-muted px-1.5 py-0.5 rounded bg-edge-surface border border-edge-border/50">
                    {item.category}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="p-2 border-t border-edge-border bg-edge-surface-secondary/30 text-[10px] text-edge-text-muted flex justify-between items-center">
          <span>Navigate: ↑ / ↓</span>
          <span>Select: ↵ Enter</span>
          <span>Switch Desk: Focus [Name]</span>
        </div>
      </div>
    </div>
  );
};
