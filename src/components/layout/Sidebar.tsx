'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
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
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Terminal,
  Plus
} from 'lucide-react';
import { useTrading } from '../../context/TradingContext';

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  { name: 'Overview', href: '/', icon: LayoutDashboard },
  { name: 'Accounts', href: '/accounts', icon: Wallet },
  { name: 'Trades', href: '/trades', icon: ArrowLeftRight },
  { name: 'Strategies', href: '/strategies', icon: TrendingUp },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Journal', href: '/journal', icon: BookOpen },
  { name: 'Calendar', href: '/calendar', icon: Calendar },
  { name: 'Risk Terminal', href: '/risk', icon: ShieldAlert },
  { name: 'Reports', href: '/reports', icon: FileText },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export const Sidebar: React.FC<{ onOpenQuickTrade?: () => void }> = ({ onOpenQuickTrade }) => {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { riskAlerts } = useTrading();

  const unreadAlerts = riskAlerts.filter((a) => !a.acknowledged).length;

  return (
    <aside
      className={`fixed top-0 left-0 z-40 h-screen transition-all duration-300 ease-in-out flex flex-col border-r border-edge-border bg-edge-surface ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Brand Header */}
      <div className="flex items-center justify-between h-14 px-3 border-b border-edge-border">
        {!collapsed && (
          <Link href="/" className="flex items-center space-x-2.5">
            <div className="w-7 h-7 rounded bg-edge-accent/15 border border-edge-accent/40 flex items-center justify-center text-edge-accent font-mono font-bold text-sm">
              EL
            </div>
            <div className="flex flex-col">
              <span className="font-mono text-sm font-bold tracking-wider text-edge-text-primary uppercase">
                EDGE<span className="text-edge-accent">LEDGER</span>
              </span>
              <span className="text-[9px] text-edge-text-muted tracking-widest uppercase font-mono">
                TERMINAL OS
              </span>
            </div>
          </Link>
        )}
        {collapsed && (
          <div className="w-full flex justify-center">
            <div className="w-7 h-7 rounded bg-edge-accent/15 border border-edge-accent/40 flex items-center justify-center text-edge-accent font-mono font-bold text-xs">
              EL
            </div>
          </div>
        )}

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-edge-text-muted hover:text-white p-1 rounded hover:bg-edge-surface-secondary transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Quick Trade Button */}
      {onOpenQuickTrade && (
        <div className="p-2 border-b border-edge-border/50">
          <button
            onClick={onOpenQuickTrade}
            className={`w-full flex items-center justify-center space-x-2 py-2 px-2.5 rounded font-mono text-xs font-semibold tracking-wide transition-all shadow-subtle ${
              collapsed
                ? 'bg-edge-accent text-edge-bg hover:bg-edge-accent-light'
                : 'bg-edge-accent/10 border border-edge-accent/40 text-edge-accent hover:bg-edge-accent hover:text-edge-bg'
            }`}
            title="Quick Trade Entry (Ctrl/Cmd + N)"
          >
            <Plus size={15} />
            {!collapsed && <span>NEW TRADE</span>}
          </button>
        </div>
      )}

      {/* Navigation List */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center px-2.5 py-2 rounded text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-edge-accent/15 text-edge-accent border border-edge-accent/30 font-semibold'
                  : 'text-edge-text-secondary hover:text-white hover:bg-edge-surface-secondary/70 border border-transparent'
              } ${collapsed ? 'justify-center' : 'justify-between'}`}
              title={collapsed ? item.name : undefined}
            >
              <div className="flex items-center space-x-3">
                <Icon
                  size={16}
                  className={isActive ? 'text-edge-accent' : 'text-edge-text-secondary'}
                />
                {!collapsed && <span>{item.name}</span>}
              </div>

              {!collapsed && item.name === 'Risk Terminal' && unreadAlerts > 0 && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-edge-loss/20 text-edge-loss border border-edge-loss/40">
                  {unreadAlerts}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* System Status Footer */}
      <div className="p-3 border-t border-edge-border text-[11px] font-mono text-edge-text-muted">
        {!collapsed ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-edge-profit animate-pulse" />
              <span>TERMINAL SYNCED</span>
            </div>
            <span className="text-[10px] text-edge-text-muted">v1.0.4</span>
          </div>
        ) : (
          <div className="flex justify-center" title="Risk Engine Active">
            <span className="w-2 h-2 rounded-full bg-edge-profit" />
          </div>
        )}
      </div>
    </aside>
  );
};
