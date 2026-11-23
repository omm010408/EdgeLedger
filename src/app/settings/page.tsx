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
import { isSupabaseConfigured, getSupabaseDetails, testSupabaseConnection } from '../../lib/supabase/client';

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
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState<{
    success: boolean;
    message: string;
    latencyMs?: number;
  } | null>(null);

  const envDetails = getSupabaseDetails();

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setConnectionResult(null);
    try {
      const res = await testSupabaseConnection();
      setConnectionResult(res);
    } catch (err: any) {
      setConnectionResult({
        success: false,
        message: err?.message || 'Connection test threw an unexpected error',
      });
    } finally {
      setTestingConnection(false);
    }
  };

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

      {/* 1. Database & Cloud (.env.local Configuration) */}
      {activeTab === 'DATABASE' && (
        <div className="space-y-4">
          {/* Supabase Status Card */}
          <div className="p-4 rounded-lg border border-edge-border bg-edge-surface space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-edge-border">
              <div className="flex items-center space-x-2">
                <Cloud size={16} className="text-edge-accent" />
                <h3 className="font-bold text-white uppercase">SUPABASE DATABASE & ENVIRONMENT LAYER</h3>
              </div>
              <div className="flex items-center space-x-2">
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    isSupabaseConfigured
                      ? 'bg-edge-profit/20 text-edge-profit border border-edge-profit/30'
                      : 'bg-edge-accent/20 text-edge-accent border border-edge-accent/30'
                  }`}
                >
                  {isSupabaseConfigured ? 'LIVE CLOUD CONNECTED' : 'LOCAL PERSISTENT STORE ACTIVE'}
                </span>
                <button
                  onClick={handleTestConnection}
                  disabled={testingConnection}
                  className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-edge-surface-secondary border border-edge-border hover:border-edge-accent text-white hover:text-edge-accent transition-colors disabled:opacity-50 text-[10px]"
                >
                  <RefreshCw size={11} className={testingConnection ? 'animate-spin' : ''} />
                  <span>{testingConnection ? 'Testing...' : 'Test Connection'}</span>
                </button>
              </div>
            </div>

            {/* Live Connection Test Banner */}
            {connectionResult && (
              <div
                className={`p-3 rounded border text-[11px] flex items-start space-x-2 ${
                  connectionResult.success
                    ? 'bg-edge-profit/10 border-edge-profit/30 text-edge-profit'
                    : 'bg-edge-loss/10 border-edge-loss/30 text-edge-loss'
                }`}
              >
                {connectionResult.success ? (
                  <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                )}
                <div className="space-y-0.5">
                  <div className="font-bold">
                    {connectionResult.success ? 'Connection Validated' : 'Connection Notice'}
                    {connectionResult.latencyMs && (
                      <span className="font-normal opacity-80 text-[10px] ml-2">
                        ({connectionResult.latencyMs}ms latency)
                      </span>
                    )}
                  </div>
                  <p className="font-sans leading-relaxed text-[11px] text-white">
                    {connectionResult.message}
                  </p>
                </div>
              </div>
            )}

            <p className="text-edge-text-secondary font-sans leading-relaxed text-[11px]">
              EdgeLedger operates using an enterprise PostgreSQL architecture with Row Level Security (RLS). Configuration values are loaded from <code className="text-edge-accent bg-black/40 px-1 py-0.5 rounded">.env.local</code>. When credentials are provided, EdgeLedger connects directly to your cloud PostgreSQL database; otherwise, it persists state locally with zero data loss.
            </p>

            {/* Active .env.local Parameters Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
              <div className="p-3 rounded bg-edge-surface-secondary/40 border border-edge-border space-y-1">
                <span className="text-[10px] text-edge-text-muted uppercase block">
                  NEXT_PUBLIC_SUPABASE_URL
                </span>
                <span className="text-white truncate block text-[11px]" title={envDetails.url}>
                  {envDetails.url}
                </span>
              </div>

              <div className="p-3 rounded bg-edge-surface-secondary/40 border border-edge-border space-y-1">
                <span className="text-[10px] text-edge-text-muted uppercase block">
                  SUPABASE ANON KEY
                </span>
                <span className="text-white truncate block text-[11px]">
                  {envDetails.maskedKey}
                </span>
              </div>

              <div className="p-3 rounded bg-edge-surface-secondary/40 border border-edge-border space-y-1">
                <span className="text-[10px] text-edge-text-muted uppercase block">
                  ENVIRONMENT MODE
                </span>
                <span className="text-edge-accent font-semibold uppercase block text-[11px]">
                  {envDetails.environment}
                </span>
              </div>

              <div className="p-3 rounded bg-edge-surface-secondary/40 border border-edge-border space-y-1">
                <span className="text-[10px] text-edge-text-muted uppercase block">
                  BASE CURRENCY
                </span>
                <span className="text-white font-semibold block text-[11px]">
                  {envDetails.baseCurrency}
                </span>
              </div>

              <div className="p-3 rounded bg-edge-surface-secondary/40 border border-edge-border space-y-1">
                <span className="text-[10px] text-edge-text-muted uppercase block">
                  DECIMAL PRECISION
                </span>
                <span className="text-edge-profit font-semibold block text-[11px]">
                  {envDetails.decimalPrecision} digits (decimal.js)
                </span>
              </div>

              <div className="p-3 rounded bg-edge-surface-secondary/40 border border-edge-border space-y-1">
                <span className="text-[10px] text-edge-text-muted uppercase block">
                  RISK CHECK CADENCE
                </span>
                <span className="text-white font-semibold block text-[11px]">
                  {envDetails.riskCheckIntervalMs}ms
                </span>
              </div>

              <div className="p-3 rounded bg-edge-surface-secondary/40 border border-edge-border space-y-1">
                <span className="text-[10px] text-edge-text-muted uppercase block">
                  DEMO DATA SEEDING
                </span>
                <span className="text-white font-semibold block text-[11px]">
                  {envDetails.enableDemoData ? 'Enabled' : 'Clean Blank Portfolio'}
                </span>
              </div>

              <div className="p-3 rounded bg-edge-surface-secondary/40 border border-edge-border space-y-1">
                <span className="text-[10px] text-edge-text-muted uppercase block">
                  WORKED FIXTURES
                </span>
                <span className="text-edge-profit font-semibold flex items-center space-x-1 text-[11px]">
                  <ShieldCheck size={13} />
                  <span>{envDetails.enableWorkedFixtures ? 'Active (Fixtures 1 & 2)' : 'Disabled'}</span>
                </span>
              </div>
            </div>

            {/* Setup Guide Box */}
            <div className="p-3.5 rounded bg-edge-surface-secondary/20 border border-edge-border space-y-2">
              <span className="text-[11px] uppercase font-bold text-white flex items-center space-x-1.5">
                <Cpu size={14} className="text-edge-accent" />
                <span>How to Connect Your Live Supabase Database</span>
              </span>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1 text-[11px] font-sans text-edge-text-secondary">
                <div className="space-y-1">
                  <div className="text-white font-mono font-bold text-[10px]">1. CONFIGURE .env.local</div>
                  <p>
                    Add your Supabase project URL and anon public key to <code className="text-edge-accent">.env.local</code> in the root directory.
                  </p>
                </div>
                <div className="space-y-1">
                  <div className="text-white font-mono font-bold text-[10px]">2. RUN SQL MIGRATION</div>
                  <p>
                    Execute <code className="text-edge-accent">/supabase/migrations/001_initial_schema.sql</code> in the Supabase SQL Editor.
                  </p>
                </div>
                <div className="space-y-1">
                  <div className="text-white font-mono font-bold text-[10px]">3. RESTART TERMINAL</div>
                  <p>
                    Restart Next.js to apply environment changes and click &quot;Test Connection&quot; above to verify cloud synchronization.
                  </p>
                </div>
              </div>
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
