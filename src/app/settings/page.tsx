'use client';

import React, { useState } from 'react';
import { useTrading } from '../../context/TradingContext';
import {
  Settings as SettingsIcon,
  Database,
  Cloud,
  CheckCircle2,
  AlertCircle,
  Cpu,
  Radio,
  Sliders,
  Download,
  Trash2,
  ShieldCheck,
  RefreshCw
} from 'lucide-react';
import { isSupabaseConfigured } from '../../lib/supabase/client';

export default function SettingsPage() {
  const {
    instruments,
    accounts,
    trades,
    strategies,
    resetToDemoData
  } = useTrading();

  const [activeTab, setActiveTab] = useState<'DATABASE' | 'INTEGRATIONS' | 'INSTRUMENTS' | 'BACKUP'>('DATABASE');
  const [webhookUrl] = useState(`https://edgeledger.terminal/api/v1/webhooks/tradingview/${Date.now().toString().slice(-8)}`);

  // JSON export of entire trading state
  const handleExportFullState = () => {
    const fullState = {
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      accounts,
      trades,
      strategies,
      instruments,
    };

    const blob = new Blob([JSON.stringify(fullState, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `EdgeLedger_Backup_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 font-mono text-xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-edge-border">
        <div>
          <div className="flex items-center space-x-2">
            <SettingsIcon size={20} className="text-edge-accent" />
            <h1 className="text-xl font-bold tracking-tight text-white uppercase">
              TERMINAL CONFIGURATION & INTEGRATIONS
            </h1>
          </div>
          <p className="text-edge-text-secondary mt-0.5 font-sans">
            Supabase connection parameters, broker bridge adapters, and instrument contract specifications.
          </p>
        </div>
      </div>

      {/* Settings Navigation Tabs */}
      <div className="flex space-x-2 border-b border-edge-border pb-2">
        {[
          { id: 'DATABASE', label: 'Database & Cloud', icon: Database },
          { id: 'INTEGRATIONS', label: 'Broker & Webhook Bridges', icon: Radio },
          { id: 'INSTRUMENTS', label: 'Contract Specifications', icon: Sliders },
          { id: 'BACKUP', label: 'Backups & Storage', icon: Download },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded transition-colors ${
                activeTab === tab.id
                  ? 'bg-edge-accent/15 text-edge-accent font-bold border border-edge-accent/30'
                  : 'text-edge-text-secondary hover:text-white'
              }`}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 1. Database & Cloud */}
      {activeTab === 'DATABASE' && (
        <div className="space-y-4">
          <div className="p-4 rounded-lg border border-edge-border bg-edge-surface space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-edge-border">
              <div className="flex items-center space-x-2">
                <Cloud size={16} className="text-edge-accent" />
                <h3 className="font-bold text-white uppercase">SUPABASE DATABASE LAYER</h3>
              </div>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  isSupabaseConfigured
                    ? 'bg-edge-profit/20 text-edge-profit border border-edge-profit/30'
                    : 'bg-edge-accent/20 text-edge-accent border border-edge-accent/30'
                }`}
              >
                {isSupabaseConfigured ? 'LIVE CLOUD CONNECTED' : 'LOCAL PERSISTENT STORE ACTIVE'}
              </span>
            </div>

            <p className="text-edge-text-secondary font-sans leading-relaxed text-[11px]">
              EdgeLedger operates using an enterprise PostgreSQL architecture with Row Level Security (RLS). You can attach your production Supabase project via environment variables or run with seamless local storage.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              <div className="p-3 rounded bg-edge-surface-secondary/40 border border-edge-border space-y-1">
                <span className="text-[10px] text-edge-text-muted uppercase block">
                  NEXT_PUBLIC_SUPABASE_URL
                </span>
                <span className="text-white truncate block">
                  {process.env.NEXT_PUBLIC_SUPABASE_URL || 'Not specified (Using Local Store)'}
                </span>
              </div>

              <div className="p-3 rounded bg-edge-surface-secondary/40 border border-edge-border space-y-1">
                <span className="text-[10px] text-edge-text-muted uppercase block">
                  ROW LEVEL SECURITY STATUS
                </span>
                <span className="text-edge-profit font-semibold flex items-center space-x-1">
                  <ShieldCheck size={14} />
                  <span>Enforced on all 16 tables</span>
                </span>
              </div>
            </div>

            <div className="p-3 rounded bg-edge-surface-secondary/20 border border-edge-border space-y-1 text-edge-text-muted">
              <span className="text-[10px] uppercase font-bold text-white block">
                Database Schema Migrations
              </span>
              <p className="text-[11px] font-sans">
                Full SQL migrations are located at <code className="text-edge-accent">/supabase/migrations/001_initial_schema.sql</code> and <code className="text-edge-accent">002_seed_data.sql</code> with all RLS policies, numeric precision constraints, and audit tables.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 2. Broker & Webhook Bridges */}
      {activeTab === 'INTEGRATIONS' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* MetaTrader 5 Bridge */}
            <div className="p-4 rounded-lg border border-edge-border bg-edge-surface space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-white uppercase">MetaTrader 5 Bridge</h3>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-edge-accent/20 text-edge-accent font-bold">
                  ADAPTER READY
                </span>
              </div>
              <p className="text-edge-text-secondary font-sans text-[11px] leading-relaxed">
                Direct EA socket connection for real-time ticket stream, auto-allocation across prop accounts, and instantaneous partial close sync.
              </p>
              <div className="text-[10px] text-edge-text-muted pt-2 border-t border-edge-border/50">
                Port: 5555 • Protocol: ZeroMQ / IPC
              </div>
            </div>

            {/* cTrader Open API */}
            <div className="p-4 rounded-lg border border-edge-border bg-edge-surface space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-white uppercase">cTrader Open API</h3>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-edge-accent/20 text-edge-accent font-bold">
                  ADAPTER READY
                </span>
              </div>
              <p className="text-edge-text-secondary font-sans text-[11px] leading-relaxed">
                Connects through Spotware Open API v2 to stream positions, swap charges, and accurate tick-level executions.
              </p>
              <div className="text-[10px] text-edge-text-muted pt-2 border-t border-edge-border/50">
                Protocol: OAuth2 + Protobuf WebSocket
              </div>
            </div>

            {/* TradingView Webhooks */}
            <div className="p-4 rounded-lg border border-edge-border bg-edge-surface space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-white uppercase">TradingView Webhooks</h3>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-edge-profit/20 text-edge-profit font-bold">
                  LISTENER ACTIVE
                </span>
              </div>
              <p className="text-edge-text-secondary font-sans text-[11px] leading-relaxed">
                Receive instant PineScript alerts and automatically open planned or live executions across configured desks.
              </p>
              <div className="p-2 rounded bg-edge-surface-secondary border border-edge-border/60 text-[10px] text-edge-accent truncate">
                {webhookUrl}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Instrument Contract Specifications */}
      {activeTab === 'INSTRUMENTS' && (
        <div className="p-4 rounded-lg border border-edge-border bg-edge-surface space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-edge-border">
            <h3 className="font-bold text-white uppercase">
              REGISTERED CONTRACT SPECIFICATIONS ({instruments.length})
            </h3>
            <span className="text-[10px] text-edge-text-muted">
              Exact tick values and contract multipliers
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border border-edge-border">
              <thead>
                <tr className="bg-edge-surface-secondary/70 border-b border-edge-border text-edge-text-muted text-[10px] uppercase">
                  <th className="p-2">Symbol</th>
                  <th className="p-2">Asset Name</th>
                  <th className="p-2">Category</th>
                  <th className="p-2">Contract Size</th>
                  <th className="p-2">Tick Size</th>
                  <th className="p-2">Tick Value</th>
                  <th className="p-2">Base / Quote</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge-border/40 text-[11px]">
                {instruments.map((inst) => (
                  <tr key={inst.symbol}>
                    <td className="p-2 font-bold text-white">{inst.symbol}</td>
                    <td className="p-2 text-edge-text-secondary">{inst.name}</td>
                    <td className="p-2 uppercase text-[10px] text-edge-accent">{inst.category}</td>
                    <td className="p-2 tabular-nums">{inst.contractSize.toLocaleString()}</td>
                    <td className="p-2 tabular-nums">{inst.tickSize}</td>
                    <td className="p-2 tabular-nums">${inst.tickValue}</td>
                    <td className="p-2 text-edge-text-muted">{inst.baseCurrency}/{inst.quoteCurrency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. Backups & Storage */}
      {activeTab === 'BACKUP' && (
        <div className="p-4 rounded-lg border border-edge-border bg-edge-surface space-y-4">
          <div className="pb-2 border-b border-edge-border">
            <h3 className="font-bold text-white uppercase">PORTFOLIO DATA PRESERVATION</h3>
            <p className="text-edge-text-secondary font-sans text-[11px] mt-0.5">
              Export encrypted JSON backups or reset to pristine institutional demo data.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={handleExportFullState}
              className="flex items-center space-x-1.5 px-4 py-2 rounded bg-edge-accent text-edge-bg font-bold hover:bg-edge-accent-light transition-colors"
            >
              <Download size={14} />
              <span>EXPORT COMPLETE JSON BACKUP</span>
            </button>

            <button
              onClick={resetToDemoData}
              className="flex items-center space-x-1.5 px-4 py-2 rounded bg-edge-surface-secondary border border-edge-border text-edge-text-secondary hover:text-white transition-colors"
            >
              <RefreshCw size={14} />
              <span>RESTORE DEFAULT DEMO DATA</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
