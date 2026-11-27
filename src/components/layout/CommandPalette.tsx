'use client';

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTrading } from '../../context/TradingContext';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenQuickTrade: () => void;
  onOpenNewAccount: () => void;
}

type GroupName = 'Actions' | 'Desks' | 'Pages';
type ScopeFilter = 'all' | GroupName;

interface PaletteItem {
  id: string;
  g: GroupName;
  label: string;
  short?: string;
  sub: string;
  kw: string;
  meta?: string;
  tone?: 'pos' | 'neg';
  isCurrency?: boolean;
  run: () => void;
}

const GROUPS: GroupName[] = ['Actions', 'Desks', 'Pages'];
const SCOPES: Array<{ key: ScopeFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'Actions', label: 'Actions' },
  { key: 'Desks', label: 'Desks' },
  { key: 'Pages', label: 'Pages' },
];
const ACTION_NOTE: Record<GroupName, string> = {
  Actions: 'Starting',
  Desks: 'Focused',
  Pages: 'Opening',
};

function formatSignedPnl(val: number): string {
  const abs = Math.abs(val).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (val === 0) return '$0.00';
  return `${val < 0 ? '−' : '+'}$${abs}`;
}

function tokensOf(q: string): string[] {
  return q.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function matchItem(it: PaletteItem, tokens: string[]): boolean {
  const hay = `${it.label} ${it.sub} ${it.kw}`.toLowerCase();
  return tokens.every((t) => hay.includes(t));
}

function scoreItem(it: PaletteItem, tokens: string[]): number {
  const lower = it.label.toLowerCase();
  return tokens.reduce(
    (sum, t) => sum + (lower.includes(t) ? 3 : 0) + (lower.startsWith(t) ? 2 : 0),
    0
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function HighlightText({ text, tokens }: { text: string; tokens: string[] }) {
  if (tokens.length === 0) return <>{text}</>;
  const regex = new RegExp(`(${tokens.map(escapeRegExp).join('|')})`, 'gi');
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, idx) =>
        idx % 2 === 1 ? <mark key={idx}>{part}</mark> : <React.Fragment key={idx}>{part}</React.Fragment>
      )}
    </>
  );
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onOpenQuickTrade,
  onOpenNewAccount,
}) => {
  const router = useRouter();
  const { accounts, trades, setSelectedAccountId, isPnlHidden } = useTrading();

  const titleId = useId();
  const listId = useId();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ScopeFilter>('all');
  const [activeIdx, setActiveIdx] = useState(0);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const scopeRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const optionRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  const lastFocusRef = useRef<HTMLElement | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNote = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToastMsg(null);
    }, 2000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Capture focus before opening & reset query/scope cleanly on open
  useEffect(() => {
    if (isOpen) {
      if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
        lastFocusRef.current = document.activeElement;
      }
      setQuery('');
      setFilter('all');
      setActiveIdx(0);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    } else if (lastFocusRef.current) {
      const target = lastFocusRef.current;
      lastFocusRef.current = null;
      requestAnimationFrame(() => {
        if (target && typeof target.focus === 'function') {
          target.focus();
        }
      });
    }
  }, [isOpen]);

  const items: PaletteItem[] = useMemo(() => {
    const closedTrades = trades.filter((t) => t.status === 'CLOSED');
    const totalPnl = closedTrades.reduce((sum, t) => sum + (t.netPnl || 0), 0);

    const deskItems: PaletteItem[] = [
      {
        id: 'd-all',
        g: 'Desks',
        label: 'All desks (consolidated)',
        short: 'All desks',
        sub: `${trades.length} ${trades.length === 1 ? 'trade' : 'trades'} · portfolio total`,
        meta: formatSignedPnl(totalPnl),
        tone: totalPnl < 0 ? 'neg' : totalPnl > 0 ? 'pos' : undefined,
        isCurrency: true,
        kw: 'all consolidated portfolio total desks focus',
        run: () => setSelectedAccountId('ALL'),
      },
      ...accounts.map((acc): PaletteItem => {
        const accClosed = closedTrades.filter((t) =>
          t.allocations.some((a) => a.accountId === acc.id)
        );
        const accTradeCount = trades.filter((t) =>
          t.allocations.some((a) => a.accountId === acc.id)
        ).length;
        const accPnl = accClosed.reduce((sum, t) => {
          const alloc = t.allocations.find((a) => a.accountId === acc.id);
          return sum + (alloc?.netPnl || 0);
        }, 0);
        const deltaFromStart = (acc.currentEquity || 0) - (acc.startingBalance || 0);
        const shownPnl = accClosed.length > 0 ? accPnl : deltaFromStart;

        return {
          id: `d-${acc.id}`,
          g: 'Desks',
          label: acc.name,
          short: acc.name,
          sub: `${acc.brokerOrFirm} · ${accTradeCount} ${accTradeCount === 1 ? 'trade' : 'trades'}`,
          meta: formatSignedPnl(shownPnl),
          tone: shownPnl < 0 ? 'neg' : shownPnl > 0 ? 'pos' : undefined,
          isCurrency: true,
          kw: `${acc.name} ${acc.brokerOrFirm} ${acc.challengePhase} desk account focus`,
          run: () => setSelectedAccountId(acc.id),
        };
      }),
    ];

    const actionItems: PaletteItem[] = [
      {
        id: 'a-trade',
        g: 'Actions',
        label: 'Record new trade execution',
        sub: 'Opens the execution form',
        kw: 'trade entry buy sell order record new execution',
        run: () => onOpenQuickTrade(),
      },
      {
        id: 'a-desk',
        g: 'Actions',
        label: 'Provision new trading desk account',
        sub: 'Adds a prop or broker account',
        kw: 'account add desk provision new',
        run: () => onOpenNewAccount(),
      },
    ];

    const pageItems: PaletteItem[] = [
      {
        id: 'n-ov',
        g: 'Pages',
        label: 'Overview',
        sub: 'Dashboard and terminal status',
        kw: 'home dashboard terminal overview',
        run: () => router.push('/'),
      },
      {
        id: 'n-acc',
        g: 'Pages',
        label: 'Accounts',
        sub: 'Balances, equity and provisioning',
        kw: 'accounts equity balance desk',
        run: () => router.push('/accounts'),
      },
      {
        id: 'n-tr',
        g: 'Pages',
        label: 'Trades',
        sub: 'Execution ledger',
        kw: 'trades ledger executions',
        run: () => router.push('/trades'),
      },
      {
        id: 'n-cal',
        g: 'Pages',
        label: 'Calendar',
        sub: 'Daily P&L and sessions',
        kw: 'calendar day week',
        run: () => router.push('/calendar'),
      },
      {
        id: 'n-jr',
        g: 'Pages',
        label: 'Journal',
        sub: 'Notes and reviews',
        kw: 'journal notes review',
        run: () => router.push('/journal'),
      },
      {
        id: 'n-rk',
        g: 'Pages',
        label: 'Risk',
        sub: 'Limits and rule gates',
        kw: 'risk limits drawdown gates',
        run: () => router.push('/risk'),
      },
      {
        id: 'n-rp',
        g: 'Pages',
        label: 'Reports',
        sub: 'Compliance, attribution and stress',
        kw: 'reports compliance attribution stress',
        run: () => router.push('/reports'),
      },
      {
        id: 'n-st',
        g: 'Pages',
        label: 'Strategies',
        sub: 'Playbook and attribution',
        kw: 'strategy strategies playbook setup',
        run: () => router.push('/strategies'),
      },
      {
        id: 'n-an',
        g: 'Pages',
        label: 'Analytics',
        sub: 'Performance and drawdown',
        kw: 'analytics performance statistics',
        run: () => router.push('/analytics'),
      },
      {
        id: 'n-se',
        g: 'Pages',
        label: 'Settings',
        sub: 'Database, bridges, contracts, backups',
        kw: 'settings backup contracts bridges database export',
        run: () => router.push('/settings'),
      },
    ];

    return [...actionItems, ...deskItems, ...pageItems];
  }, [accounts, trades, onOpenNewAccount, onOpenQuickTrade, router, setSelectedAccountId]);

  const tokens = useMemo(() => tokensOf(query), [query]);

  const { sections, flat } = useMemo(() => {
    const inScope = (it: PaletteItem) => filter === 'all' || it.g === filter;
    const pool = items.filter((it) => inScope(it) && (tokens.length === 0 || matchItem(it, tokens)));

    const recents =
      tokens.length === 0
        ? recentIds
            .map((id) => items.find((i) => i.id === id))
            .filter((it): it is PaletteItem => Boolean(it && inScope(it)))
        : [];
    const recentSet = new Set(recents.map((r) => r.id));

    const builtSections: Array<{ name: string; items: PaletteItem[] }> = [];
    if (recents.length > 0) {
      builtSections.push({ name: 'Recent', items: recents });
    }

    GROUPS.forEach((group) => {
      const grouped = pool
        .filter((it) => it.g === group && !recentSet.has(it.id))
        .sort((a, b) => scoreItem(b, tokens) - scoreItem(a, tokens));
      if (grouped.length > 0) {
        builtSections.push({ name: group, items: grouped });
      }
    });

    const flatList: PaletteItem[] = [];
    builtSections.forEach((sec) => {
      sec.items.forEach((it) => flatList.push(it));
    });

    return { sections: builtSections, flat: flatList };
  }, [items, filter, tokens, recentIds]);

  const safeActiveIdx = activeIdx >= flat.length ? 0 : activeIdx;

  const runItem = useCallback(
    (idx: number) => {
      const it = flat[idx];
      if (!it) return;
      setRecentIds((prev) => [it.id, ...prev.filter((id) => id !== it.id)].slice(0, 3));
      onClose();
      it.run();
      showNote(`${ACTION_NOTE[it.g]} ${it.g === 'Desks' ? it.short || it.label : it.label.toLowerCase()}`);
    },
    [flat, onClose, showNote]
  );

  // Scroll selected option into view smoothly
  useEffect(() => {
    if (!isOpen) return;
    const el = optionRefs.current[safeActiveIdx];
    el?.scrollIntoView({ block: 'nearest' });
  }, [isOpen, safeActiveIdx]);

  // Two-stage Escape + Tab cycle inside palette
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (query) {
          setQuery('');
          setActiveIdx(0);
        } else {
          onClose();
        }
        return;
      }

      if (e.key === 'Tab') {
        const focusables: Array<HTMLElement | null> = [
          inputRef.current,
          ...scopeRefs.current.slice(0, SCOPES.length),
        ].filter(Boolean);
        if (focusables.length === 0) return;
        const curr = document.activeElement as HTMLElement | null;
        const pos = focusables.indexOf(curr);
        e.preventDefault();
        const nextPos = e.shiftKey
          ? pos <= 0
            ? focusables.length - 1
            : pos - 1
          : (pos + 1) % focusables.length;
        focusables[nextPos]?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, query, onClose]);

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (flat.length > 0) setActiveIdx((safeActiveIdx + 1) % flat.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (flat.length > 0) setActiveIdx((safeActiveIdx - 1 + flat.length) % flat.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runItem(safeActiveIdx);
    }
  };

  let runningFlatIndex = 0;

  return (
    <>
      {isOpen && (
        <div
          className="tw-cmd-veil"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <div
            className="tw-cmd-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Search EdgeLedger"
          >
            <h2 className="sr-only" id={titleId}>
              Search EdgeLedger
            </h2>

            <div className="tw-cmd-field">
              <input
                ref={inputRef}
                type="text"
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-autocomplete="list"
                aria-activedescendant={flat.length > 0 ? `tw-cmd-opt-${safeActiveIdx}` : ''}
                placeholder="Search desks, pages and actions"
                autoComplete="off"
                spellCheck={false}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIdx(0);
                }}
                onKeyDown={handleInputKeyDown}
              />
            </div>

            <div className="tw-cmd-scopes" role="group" aria-label="Filter results">
              {SCOPES.map((s, idx) => (
                <button
                  key={s.key}
                  ref={(el) => {
                    scopeRefs.current[idx] = el;
                  }}
                  className="tw-cmd-scope"
                  type="button"
                  aria-pressed={filter === s.key}
                  onClick={() => {
                    setFilter(s.key);
                    setActiveIdx(0);
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {flat.length > 0 ? (
              <div className="tw-cmd-list" id={listId} role="listbox" aria-label="Results">
                {sections.map((section, sIdx) => {
                  const groupHeaderId = `tw-cmd-gh-${sIdx}`;
                  return (
                    <div key={section.name} role="group" aria-labelledby={groupHeaderId}>
                      <div className="tw-cmd-grp" id={groupHeaderId}>
                        {section.name}
                      </div>
                      {section.items.map((it) => {
                        const idx = runningFlatIndex++;
                        const isSelected = idx === safeActiveIdx;
                        return (
                          <button
                            key={`${section.name}-${it.id}`}
                            ref={(el) => {
                              optionRefs.current[idx] = el;
                            }}
                            id={`tw-cmd-opt-${idx}`}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            className="tw-cmd-opt"
                            onMouseMove={() => {
                              if (safeActiveIdx !== idx) setActiveIdx(idx);
                            }}
                            onClick={() => runItem(idx)}
                          >
                            <span className="tw-cmd-opt-main">
                              <span className="tw-cmd-lbl">
                                <HighlightText text={it.label} tokens={tokens} />
                              </span>
                              <span className="tw-cmd-sub">
                                <HighlightText text={it.sub} tokens={tokens} />
                              </span>
                            </span>
                            {it.meta && (
                              <span
                                className={`tw-cmd-meta ${it.tone || ''} ${
                                  it.isCurrency && isPnlHidden ? 'tw-pnl-blur' : ''
                                }`}
                              >
                                {it.meta}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="tw-cmd-none">
                No results for <b>“{query.trim()}”</b>.
                <br />
                Try a desk name, a page, or “new”.
              </p>
            )}

            <div className="tw-cmd-keys font-mono" aria-hidden="true">
              <span>↑ ↓ move</span>
              <span>↵ open</span>
              <span>esc clear, then close</span>
            </div>

            <p className="sr-only" aria-live="polite">
              {flat.length === 0
                ? 'No results'
                : `${flat.length} result${flat.length === 1 ? '' : 's'}`}
            </p>
          </div>
        </div>
      )}

      <div
        className={`tw-cmd-note ${toastMsg ? 'show' : ''}`}
        role="status"
        aria-live="polite"
      >
        {toastMsg || ''}
      </div>
    </>
  );
};
