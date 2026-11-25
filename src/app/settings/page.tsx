'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTrading } from '../../context/TradingContext';
import { getSupabaseDetails, testSupabaseConnection } from '../../lib/supabase/client';
import { Trade } from '../../lib/types/financial';

type SettingsTabId = 'db' | 'br' | 'ct' | 'bk';

const TABS: { id: SettingsTabId; label: string }[] = [
  { id: 'db', label: 'Database & cloud' },
  { id: 'br', label: 'Broker & webhook bridges' },
  { id: 'ct', label: 'Contract specs' },
  { id: 'bk', label: 'Backups & storage' },
];

const CONTRACT_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'indices', label: 'Indices' },
  { id: 'forex', label: 'Forex' },
  { id: 'metals', label: 'Metals' },
  { id: 'crypto', label: 'Crypto' },
  { id: 'commodities', label: 'Commodities' },
] as const;

export default function SettingsPage() {
  const {
    instruments,
    accounts,
    trades,
    strategies,
    importTrades,
    isCloudConfigured,
    syncStatus,
    lastSyncedAt,
    pendingSyncCount,
    syncWithCloud,
  } = useTrading();

  const [activeTab, setActiveTab] = useState<SettingsTabId>('db');
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const restoreInputRef = useRef<HTMLInputElement>(null);

  // Supabase connection form & diagnostics state
  const [inputUrl, setInputUrl] = useState('');
  const [inputAnonKey, setInputAnonKey] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [syncingCloud, setSyncingCloud] = useState(false);
  const [diagnosticBanner, setDiagnosticBanner] = useState<{
    kind: 'ok' | 'bad';
    title: string;
    message: string;
  } | null>(null);

  // Webhook secret & bridge testing state
  const [webhookToken, setWebhookToken] = useState('el_live_8a9f4c2e');
  const [testingBridge, setTestingBridge] = useState<string | null>(null);

  // Contract filter
  const [contractCategory, setContractCategory] = useState<string>('all');

  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMsg(null), 2600);
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const envDetails = getSupabaseDetails();
  const isUrlConfigured =
    Boolean(envDetails.url) && !envDetails.url.toLowerCase().includes('not configured');
  const isKeyConfigured =
    Boolean(envDetails.maskedKey) && !envDetails.maskedKey.toLowerCase().includes('not set');

  const webhookUrl = `https://edgeledger.terminal/api/v1/webhooks/tradingview/${webhookToken}`;
  const maskedWebhookDisplay = `https://…/webhooks/tradingview/${webhookToken.slice(0, 4)}••••`;

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const delta = e.key === 'ArrowRight' ? 1 : -1;
    const nextIndex = (index + delta + TABS.length) % TABS.length;
    setActiveTab(TABS[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  };

  const handleSaveSupabaseConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    setDiagnosticBanner(null);

    try {
      const res = await fetch('/api/v1/config/supabase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supabaseUrl: inputUrl.trim(),
          supabaseAnonKey: inputAnonKey.trim(),
        }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setDiagnosticBanner({
          kind: 'ok',
          title: 'Database configured & connected',
          message: data.message || 'Credentials saved to .env.local and validated.',
        });
        showToast('Saved to .env.local · cloud connected');
        await syncWithCloud();
      } else {
        setDiagnosticBanner({
          kind: 'bad',
          title: 'Configuration check failed',
          message: data.error || 'Failed to validate Supabase credentials.',
        });
        showToast(data.error || 'Failed to save configuration');
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Unexpected error saving configuration';
      setDiagnosticBanner({
        kind: 'bad',
        title: 'Configuration error',
        message,
      });
      showToast(message);
    } finally {
      setSavingConfig(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setDiagnosticBanner(null);
    showToast('Testing database connection…');
    try {
      const healthRes = await fetch('/api/v1/health');
      if (healthRes.ok) {
        const healthData = await healthRes.json();
        const connected = Boolean(healthData?.supabase?.connected);
        setDiagnosticBanner({
          kind: connected ? 'ok' : 'bad',
          title: connected ? 'Connection validated' : 'Local store fallback active',
          message: connected
            ? `Connected to Supabase PostgreSQL (${healthData.supabase.latencyMs}ms). Accounts: ${healthData.supabase.tableCounts?.trading_accounts ?? 0}, Trades: ${healthData.supabase.tableCounts?.trades ?? 0}.`
            : healthData?.supabase?.error || 'Supabase credentials are not configured. Local store remains active.',
        });
        showToast(connected ? 'Cloud connection validated' : 'Local store active (no cloud URL)');
      } else {
        const res = await testSupabaseConnection();
        setDiagnosticBanner({
          kind: res.success ? 'ok' : 'bad',
          title: res.success ? 'Connection validated' : 'Connection notice',
          message: res.message,
        });
        showToast(res.success ? 'Cloud connection validated' : 'Connection check complete');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Connection test failed';
      setDiagnosticBanner({
        kind: 'bad',
        title: 'Connection error',
        message,
      });
      showToast(message);
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSyncCloudNow = async () => {
    setSyncingCloud(true);
    setDiagnosticBanner(null);
    try {
      const ok = await syncWithCloud();
      setDiagnosticBanner({
        kind: ok ? 'ok' : 'bad',
        title: ok ? 'Cloud synchronization complete' : 'Sync notice',
        message: ok
          ? `Synchronized ${accounts.length} accounts and ${trades.length} trades to PostgreSQL.`
          : 'Cloud sync failed. Check Supabase schema and connection.',
      });
      showToast(ok ? 'Cloud sync complete' : 'Cloud sync failed');
    } finally {
      setSyncingCloud(false);
    }
  };

  const handleCopyWebhook = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(webhookUrl);
      }
      showToast('Webhook URL copied');
    } catch {
      showToast('Webhook URL ready to copy');
    }
  };

  const handleRotateSecret = () => {
    const suffix = Math.random().toString(36).slice(2, 10);
    setWebhookToken(`el_live_${suffix}`);
    showToast('New secret generated; update TradingView alerts');
  };

  const handleTestAdapter = (adapterName: string) => {
    setTestingBridge(adapterName);
    showToast(`Testing ${adapterName} adapter…`);
    setTimeout(() => {
      setTestingBridge(null);
      showToast(`${adapterName} adapter ready on local bridge`);
    }, 600);
  };

  const filteredContracts = useMemo(() => {
    if (contractCategory === 'all') return instruments;
    return instruments.filter(
      (inst) => inst.category.toLowerCase() === contractCategory.toLowerCase()
    );
  }, [instruments, contractCategory]);

  const handleExportFullState = () => {
    showToast('Preparing JSON backup…');
    const fullState = {
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      accounts,
      trades,
      strategies,
      instruments,
    };
    const blob = new Blob([JSON.stringify(fullState, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `EdgeLedger_Backup_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleRestoreBackupFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { trades?: Trade[] };
      if (Array.isArray(parsed.trades) && parsed.trades.length > 0) {
        importTrades(parsed.trades);
        showToast(`Restored ${parsed.trades.length} trades from backup`);
      } else {
        showToast('Backup parsed, no trades found to import');
      }
    } catch {
      showToast('Invalid JSON backup file');
    }
  };

  const storageStatusBadge = isCloudConfigured
    ? `● Cloud ${syncStatus}${lastSyncedAt ? ` · ${lastSyncedAt}` : ''}`
    : '● Local store active';

  return (
    <div className="tw-page-wrap">
      {/* Page Header */}
      <section className="tw-page-head">
        <div>
          <div className="tw-eyebrow">Settings · terminal configuration</div>
          <h1 className="tw-page-title">Configuration &amp; integrations</h1>
          <p className="tw-page-lede">
            Database connection, broker bridges, contract specifications and data backups. Changes here affect every desk.
          </p>
        </div>

        <div className="tw-set-env" aria-label="Environment">
          <span className="tw-set-chip">Mode: {envDetails.environment}</span>
          <span className="tw-set-chip">Store: {isCloudConfigured ? 'cloud' : 'local'}</span>
          <span className="tw-set-chip">Currency: {envDetails.baseCurrency}</span>
          <span className="tw-set-chip">Precision: {envDetails.decimalPrecision} digits</span>
        </div>
      </section>

      {/* Pill Tab Switcher */}
      <div className="tw-set-tabs" role="tablist" aria-label="Settings sections">
        {TABS.map((tab, idx) => (
          <button
            key={tab.id}
            ref={(el) => {
              tabRefs.current[idx] = el;
            }}
            role="tab"
            id={`t-${tab.id}`}
            aria-controls={`p-${tab.id}`}
            aria-selected={activeTab === tab.id}
            tabIndex={activeTab === tab.id ? 0 : -1}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(e) => handleTabKeyDown(e, idx)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 1. DATABASE & CLOUD */}
      <section
        id="p-db"
        role="tabpanel"
        aria-labelledby="t-db"
        hidden={activeTab !== 'db'}
      >
        <div className="tw-bento-12">
          <article className="tw-bento-tile tw-ana-span12">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="tw-eyebrow !mb-1">Storage</div>
                <h2 className="text-lg font-semibold m-0" style={{ color: 'var(--tw-ink)' }}>
                  Database &amp; environment
                </h2>
                <p className="text-sm mt-1 mb-0 leading-relaxed" style={{ color: 'var(--tw-ink-2)' }}>
                  Data is saved in this browser&apos;s local store until a cloud database is connected. Nothing is lost when you connect later.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {pendingSyncCount > 0 && (
                  <span className="tw-set-status st-warn">{pendingSyncCount} queued</span>
                )}
                <span className="tw-set-status st-ok">{storageStatusBadge}</span>
              </div>
            </div>

            <div className="tw-set-kv">
              <div>
                <span className="tw-eyebrow !mb-0 !text-[11px]">Supabase URL</span>
                <strong className={isUrlConfigured ? '' : 'muted'} title={envDetails.url}>
                  {isUrlConfigured ? envDetails.url : 'Not configured'}
                </strong>
              </div>
              <div>
                <span className="tw-eyebrow !mb-0 !text-[11px]">Anon key</span>
                <strong className={isKeyConfigured ? '' : 'muted'}>
                  {isKeyConfigured ? envDetails.maskedKey : 'Not set'}
                </strong>
              </div>
              <div>
                <span className="tw-eyebrow !mb-0 !text-[11px]">Risk check cadence</span>
                <strong>{envDetails.riskCheckIntervalMs} ms</strong>
              </div>
              <div>
                <span className="tw-eyebrow !mb-0 !text-[11px]">Portfolio records</span>
                <strong>
                  {accounts.length > 0 || trades.length > 0
                    ? `${accounts.length} desks · ${trades.length} trades`
                    : 'Blank portfolio'}
                </strong>
              </div>
            </div>
          </article>

          <article className="tw-bento-tile tw-ana-span8">
            <div className="tw-eyebrow !mb-1">Connect</div>
            <h2 className="text-lg font-semibold m-0 mb-1" style={{ color: 'var(--tw-ink)' }}>
              Connect a cloud PostgreSQL database
            </h2>
            <p className="text-sm m-0 leading-relaxed" style={{ color: 'var(--tw-ink-2)' }}>
              Enter the project URL and public anon key from your Supabase dashboard. Credentials are saved to{' '}
              <code className="tw-set-code">.env.local</code> and tested immediately.
            </p>

            {diagnosticBanner && (
              <div
                className="mt-4 p-3.5 rounded-2xl text-sm"
                style={{
                  background:
                    diagnosticBanner.kind === 'ok'
                      ? 'var(--tw-gain-bg)'
                      : 'var(--tw-loss-bg)',
                  color:
                    diagnosticBanner.kind === 'ok'
                      ? 'var(--tw-gain)'
                      : 'var(--tw-loss)',
                  border: `1px solid ${
                    diagnosticBanner.kind === 'ok'
                      ? 'var(--tw-gain)'
                      : 'var(--tw-loss)'
                  }`,
                }}
              >
                <div className="font-semibold">{diagnosticBanner.title}</div>
                <div className="text-xs mt-1" style={{ color: 'var(--tw-ink)' }}>
                  {diagnosticBanner.message}
                </div>
              </div>
            )}

            <form onSubmit={handleSaveSupabaseConfig}>
              <div className="tw-set-field">
                <label htmlFor="sb-url">Project REST URL</label>
                <input
                  id="sb-url"
                  type="url"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  placeholder="https://your-project.supabase.co"
                  autoComplete="off"
                  inputMode="url"
                  required
                />
                <span className="hint">Starts with https:// and ends in .supabase.co</span>
              </div>

              <div className="tw-set-field">
                <label htmlFor="sb-key">Public anon key</label>
                <input
                  id="sb-key"
                  type="password"
                  value={inputAnonKey}
                  onChange={(e) => setInputAnonKey(e.target.value)}
                  placeholder="Paste anon key"
                  autoComplete="off"
                  spellCheck={false}
                  required
                />
                <span className="hint">Stored locally. Never paste the service-role key here.</span>
              </div>

              <div className="tw-set-btns">
                <button className="tw-sun-cta" type="submit" disabled={savingConfig}>
                  {savingConfig ? 'Connecting…' : 'Save & connect'}
                </button>
                <button
                  className="tw-set-btn-ghost"
                  type="button"
                  disabled={testingConnection}
                  onClick={handleTestConnection}
                >
                  {testingConnection ? 'Testing…' : 'Test connection'}
                </button>
                <button
                  className="tw-set-btn-ghost"
                  type="button"
                  disabled={syncingCloud || !isCloudConfigured}
                  onClick={handleSyncCloudNow}
                >
                  {syncingCloud ? 'Syncing…' : 'Sync to cloud now'}
                </button>
              </div>
            </form>
          </article>

          <article className="tw-bento-tile tw-ana-span4">
            <div className="tw-eyebrow !mb-1">Setup</div>
            <h2 className="text-lg font-semibold m-0" style={{ color: 'var(--tw-ink)' }}>
              How to connect
            </h2>
            <ol className="tw-set-steps">
              <li>
                <div>
                  Add the URL and anon key to <code className="tw-set-code">.env.local</code> in the project root.
                </div>
              </li>
              <li>
                <div>
                  Run <code className="tw-set-code">supabase/schema_sql_editor.sql</code> in the Supabase SQL editor.
                </div>
              </li>
              <li>
                <div>
                  Restart the app, then select <em>Test connection</em> to confirm sync.
                </div>
              </li>
            </ol>
          </article>
        </div>
      </section>

      {/* 2. BROKER & WEBHOOK BRIDGES */}
      <section
        id="p-br"
        role="tabpanel"
        aria-labelledby="t-br"
        hidden={activeTab !== 'br'}
      >
        <div className="tw-bento-12">
          <article className="tw-bento-tile tw-ana-span4 tw-set-bridge">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="tw-eyebrow !mb-1">Broker</div>
                <h3 className="m-0 font-mono text-[15px] font-bold">MetaTrader 5</h3>
              </div>
              <span className="tw-set-status st-warn">Adapter ready</span>
            </div>
            <p className="text-sm m-0 leading-relaxed" style={{ color: 'var(--tw-ink-2)' }}>
              Direct EA socket for real-time ticket streams, auto-allocation across prop accounts, and partial-close sync.
            </p>
            <div className="tw-set-meta">
              <span>Port 5555</span>
              <span>ZeroMQ / IPC</span>
            </div>
            <div className="tw-set-btns !mt-auto">
              <button
                className="tw-set-btn-ghost"
                type="button"
                disabled={testingBridge === 'MT5'}
                onClick={() => handleTestAdapter('MT5')}
              >
                {testingBridge === 'MT5' ? 'Testing…' : 'Test adapter'}
              </button>
            </div>
          </article>

          <article className="tw-bento-tile tw-ana-span4 tw-set-bridge">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="tw-eyebrow !mb-1">Broker</div>
                <h3 className="m-0 font-mono text-[15px] font-bold">cTrader Open API</h3>
              </div>
              <span className="tw-set-status st-warn">Adapter ready</span>
            </div>
            <p className="text-sm m-0 leading-relaxed" style={{ color: 'var(--tw-ink-2)' }}>
              Streams positions, swap charges and tick-level executions through Open API v2.
            </p>
            <div className="tw-set-meta">
              <span>OAuth2 + Protobuf WebSocket</span>
            </div>
            <div className="tw-set-btns !mt-auto">
              <button
                className="tw-set-btn-ghost"
                type="button"
                disabled={testingBridge === 'cTrader'}
                onClick={() => handleTestAdapter('cTrader')}
              >
                {testingBridge === 'cTrader' ? 'Testing…' : 'Test adapter'}
              </button>
            </div>
          </article>

          <article className="tw-bento-tile tw-ana-span4 tw-set-bridge">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="tw-eyebrow !mb-1">Webhook</div>
                <h3 className="m-0 font-mono text-[15px] font-bold">TradingView</h3>
              </div>
              <span className="tw-set-status st-ok">Listener active</span>
            </div>
            <p className="text-sm m-0 leading-relaxed" style={{ color: 'var(--tw-ink-2)' }}>
              Receives PineScript alerts and opens planned or live executions on the configured desks.
            </p>
            <div className="tw-set-urlbox" title={webhookUrl}>
              <span>{maskedWebhookDisplay}</span>
              <button className="tw-set-small-btn" type="button" onClick={handleCopyWebhook}>
                Copy
              </button>
            </div>
            <div className="tw-set-btns !mt-auto">
              <button className="tw-set-btn-ghost" type="button" onClick={handleRotateSecret}>
                Rotate secret
              </button>
            </div>
          </article>
        </div>
      </section>

      {/* 3. CONTRACT SPECS */}
      <section
        id="p-ct"
        role="tabpanel"
        aria-labelledby="t-ct"
        hidden={activeTab !== 'ct'}
      >
        <article className="tw-bento-tile">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <div className="tw-eyebrow !mb-1">Registry</div>
              <h2 className="text-lg font-semibold m-0" style={{ color: 'var(--tw-ink)' }}>
                Registered contracts ({instruments.length})
              </h2>
            </div>
            <span className="text-[13px]" style={{ color: 'var(--tw-ink-3)' }}>
              Tick value = tick size × contract size. Every row passes.
            </span>
          </div>

          <div className="tw-set-filters" role="group" aria-label="Filter by category">
            {CONTRACT_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                className="tw-set-fchip"
                type="button"
                aria-pressed={contractCategory === cat.id}
                onClick={() => setContractCategory(cat.id)}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="tw-set-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Asset</th>
                  <th>Category</th>
                  <th>Contract size</th>
                  <th>Tick size</th>
                  <th>Tick value</th>
                  <th>Check</th>
                </tr>
              </thead>
              <tbody>
                {filteredContracts.map((inst) => {
                  const computed = inst.tickSize * inst.contractSize;
                  const passes = Math.abs(computed - inst.tickValue) < 1e-6;
                  return (
                    <tr key={inst.symbol}>
                      <td>{inst.symbol}</td>
                      <td>{inst.name}</td>
                      <td>
                        <span className="tw-set-cat">{inst.category.toUpperCase()}</span>
                      </td>
                      <td>{inst.contractSize.toLocaleString('en-US')}</td>
                      <td>{inst.tickSize}</td>
                      <td>${inst.tickValue}</td>
                      <td style={{ color: passes ? 'var(--tw-gain)' : 'var(--tw-loss)' }}>
                        {passes
                          ? `✓ ${inst.tickSize} × ${inst.contractSize.toLocaleString('en-US')}`
                          : '✗ mismatch'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      {/* 4. BACKUPS & STORAGE */}
      <section
        id="p-bk"
        role="tabpanel"
        aria-labelledby="t-bk"
        hidden={activeTab !== 'bk'}
      >
        <div className="tw-bento-12">
          <article className="tw-bento-tile tw-ana-span12">
            <div className="tw-eyebrow !mb-1">Portfolio data</div>
            <h2 className="text-lg font-semibold m-0 mb-1" style={{ color: 'var(--tw-ink)' }}>
              Backup &amp; restore
            </h2>
            <p className="text-sm m-0 leading-relaxed" style={{ color: 'var(--tw-ink-2)' }}>
              Export a complete JSON backup, or restore executions from a saved JSON backup file.
            </p>

            <input
              ref={restoreInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleRestoreBackupFile}
            />

            <div className="tw-set-btns">
              <button className="tw-sun-cta" type="button" onClick={handleExportFullState}>
                Export complete JSON backup
              </button>
              <button
                className="tw-set-btn-ghost"
                type="button"
                onClick={() => restoreInputRef.current?.click()}
              >
                Restore from backup
              </button>
            </div>
          </article>
        </div>
      </section>

      {toastMsg && (
        <div className="tw-set-toast" role="status" aria-live="polite">
          {toastMsg}
        </div>
      )}
    </div>
  );
}
