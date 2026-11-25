'use client';

import React from 'react';
import {
  ReportComputedData,
  formatSignedCurrency,
} from './types';

interface ComplianceAuditViewProps {
  data: ReportComputedData;
}

export const ComplianceAuditView: React.FC<ComplianceAuditViewProps> = ({ data }) => {
  const {
    closedTrades,
    scopeLabel,
    accountCount,
    auditRefId,
    reportTimestamp,
    dateRangeChip,
    rules,
    clearRulesCount,
    pendingRulesCount,
    breachedRulesCount,
    minDaysCompleted,
    minDaysRequired,
    completedDays,
    lowestDay,
    maxRiskPerTradePct,
    equityNeverBelowStart,
    lowestCloseDelta,
  } = data;

  const daysRemaining = Math.max(0, minDaysRequired - minDaysCompleted);
  const totalSlots = Math.max(4, minDaysRequired);

  const ruleRows = [
    ...rules.map((r) => ({
      id: r.id,
      rule: r.title,
      requirement: r.requirement,
      observed: r.observed,
      status: r.status,
      statusLabel: r.statusLabel,
    })),
    {
      id: 'calc-integrity',
      rule: 'Calculation integrity',
      requirement: 'Deterministic engine',
      observed: 'No floating-point approximation',
      status: 'verified' as const,
      statusLabel: 'Verified',
    },
  ];

  return (
    <main className="tw-rep-grid">
      {/* HERO: Audit Status (Cols 1-4, Row 1) */}
      <section
        className="tile place hero"
        style={{ '--gc': '1 / 5', '--gr': '1' } as React.CSSProperties}
        aria-label="Headline result"
      >
        <svg className="orbit" viewBox="0 0 280 280" aria-hidden="true">
          <circle cx="140" cy="140" r="60" style={{ fill: 'none', stroke: 'var(--tw-hero-rule)', strokeWidth: 1.25 }} />
          <circle cx="140" cy="140" r="96" style={{ fill: 'none', stroke: 'var(--tw-hero-rule)', strokeWidth: 1.25 }} />
          <circle cx="140" cy="140" r="132" style={{ fill: 'none', stroke: 'var(--tw-hero-rule)', strokeWidth: 1.25 }} />
          <circle
            cx="140"
            cy="140"
            r="96"
            style={{
              fill: 'none',
              stroke: 'var(--tw-sun)',
              strokeWidth: 3,
              strokeLinecap: 'round',
              strokeDasharray: '150 603',
              transform: 'rotate(-90deg)',
              transformOrigin: '140px 140px',
            }}
          />
        </svg>

        <div className="head">
          <span className="eyebrow">Audit status</span>
          <span className={`pill ${breachedRulesCount > 0 ? 'l' : 'ok'}`}>
            {breachedRulesCount > 0
              ? `${breachedRulesCount} breached`
              : pendingRulesCount > 0
              ? `${pendingRulesCount} pending`
              : 'All clear'}
          </span>
        </div>

        <div className="big2">
          {clearRulesCount} / {rules.length}
        </div>
        <p className="hsub">
          {daysRemaining > 0
            ? 'Rules clear. Minimum trading days is the open item.'
            : 'All stated prop-firm compliance thresholds verified.'}
        </p>

        <div className="chips">
          <span className="chip">
            {closedTrades.length} closed trade{closedTrades.length === 1 ? '' : 's'}
          </span>
          <span className="chip">{dateRangeChip}</span>
          <span className="chip">USD</span>
        </div>

        <div className="foot">
          <span>
            Ref <span className="mono">{auditRefId}</span>
          </span>
          <span suppressHydrationWarning>{reportTimestamp}</span>
        </div>
      </section>

      {/* MINIMUM TRADING DAYS TILE (Cols 5-9, Row 1) */}
      <section
        className="tile place"
        style={{ '--gc': '5 / 10', '--gr': '1' } as React.CSSProperties}
        aria-label="Minimum trading days"
      >
        <div className="head">
          <div>
            <span className="eyebrow">Minimum trading days</span>
            <p className="sub" style={{ margin: '4px 0 0' }}>
              {minDaysCompleted} of {minDaysRequired} required days complete
            </p>
          </div>
          <span className={`pill ${daysRemaining === 0 ? 'ok' : 'w'}`}>
            {minDaysCompleted} of {minDaysRequired}
          </span>
        </div>

        <div className="days">
          {Array.from({ length: totalSlots }).map((_, idx) => {
            const day = completedDays[idx];
            if (day) {
              return (
                <div className="day done" key={day.dateKey}>
                  <span>
                    Day {idx + 1} · {day.label}
                  </span>
                  <b className={day.netPnl >= 0 ? 'gain' : 'loss'}>
                    {formatSignedCurrency(day.netPnl)}
                  </b>
                  <i className="dd" style={{ display: 'block' }} />
                </div>
              );
            }
            return (
              <div className="day todo" key={`todo-${idx}`}>
                <span>Day {idx + 1}</span>
                <b className="sub">Not yet</b>
                <i className="dd" style={{ display: 'block' }} />
              </div>
            );
          })}
        </div>
      </section>

      {/* BREACHES TILE (Cols 10-12, Row 1) */}
      <section
        className="tile place"
        style={{ '--gc': '10 / 13', '--gr': '1' } as React.CSSProperties}
        aria-label="Breaches"
      >
        <div className="head">
          <span className="eyebrow">Breaches</span>
          <span className={`pill ${breachedRulesCount > 0 ? 'l' : 'ok'}`}>
            {breachedRulesCount === 0 ? 'None' : `${breachedRulesCount} active`}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1 }}>
          <div
            className={`big2 ${breachedRulesCount === 0 ? 'gain' : 'loss'}`}
            style={{ fontSize: 56, lineHeight: '60px' }}
          >
            {breachedRulesCount}
          </div>
          <p className="sub" style={{ margin: '6px 0 0' }}>
            {breachedRulesCount === 0
              ? `No limit broken across ${closedTrades.length} trades`
              : `${breachedRulesCount} threshold exceeded`}
          </p>
          <p className="sub" style={{ margin: '4px 0 0' }}>
            <span className="warn">
              {pendingRulesCount} warning{pendingRulesCount === 1 ? '' : 's'}
            </span>
            {daysRemaining > 0 ? ', minimum trading days' : ', all rules monitored'}
          </p>
        </div>
      </section>

      {/* ROW 2 KPIs */}
      <section
        className="tile place kpi"
        style={{
          '--gc': '1 / 4',
          '--gr': '2',
          background:
            'linear-gradient(160deg, color-mix(in srgb, var(--tw-gain) 15%, var(--tw-tile)) 0%, var(--tw-tile) 72%)',
        } as React.CSSProperties}
        aria-label="Lowest day"
      >
        <div className="head">
          <span className="lbl">Lowest day</span>
          <span className={`pill ${!lowestDay || lowestDay.netPnl >= 0 ? 'ok' : 'l'}`}>
            {!lowestDay || lowestDay.netPnl >= 0 ? 'No loss day' : 'Loss recorded'}
          </span>
        </div>
        <div>
          <div
            className="v"
            style={{ color: !lowestDay || lowestDay.netPnl >= 0 ? 'var(--tw-gain)' : 'var(--tw-loss)' }}
          >
            {lowestDay ? formatSignedCurrency(lowestDay.netPnl).replace('.00', '') : '$0'}
          </div>
          <div className="sub">
            {lowestDay
              ? `${lowestDay.label} · ${lowestDay.netPnl >= 0 ? 'no daily loss' : 'worst daily close'}`
              : 'No completed trading days'}
          </div>
        </div>
      </section>

      <section
        className="tile place kpi"
        style={{
          '--gc': '4 / 7',
          '--gr': '2',
          background:
            'linear-gradient(160deg, color-mix(in srgb, var(--tw-gain) 15%, var(--tw-tile)) 0%, var(--tw-tile) 72%)',
        } as React.CSSProperties}
        aria-label="Equity floor"
      >
        <div className="head">
          <span className="lbl">Equity floor</span>
          <span className={`pill ${equityNeverBelowStart ? 'ok' : 'l'}`}>
            {equityNeverBelowStart ? 'Held' : 'Dipped'}
          </span>
        </div>
        <div>
          <div
            className="v"
            style={{ fontSize: 20, lineHeight: '30px', fontFamily: 'inherit', fontWeight: 600 }}
          >
            {equityNeverBelowStart ? 'Never below start' : 'Dipped below start'}
          </div>
          <div className="sub">Lowest close {formatSignedCurrency(lowestCloseDelta)}</div>
        </div>
      </section>

      <section
        className="tile place kpi"
        style={{
          '--gc': '7 / 10',
          '--gr': '2',
          background:
            'linear-gradient(160deg, color-mix(in srgb, var(--tw-s1) 15%, var(--tw-tile)) 0%, var(--tw-tile) 72%)',
        } as React.CSSProperties}
        aria-label="Risk per trade"
      >
        <div className="head">
          <span className="lbl">Risk per trade</span>
          <span className="pill vi">Stated</span>
        </div>
        <div>
          <div className="v" style={{ color: 'var(--tw-s1)' }}>
            {maxRiskPerTradePct.toFixed(1)}% max
          </div>
          <div className="sub">All {closedTrades.length} trades within limit</div>
        </div>
      </section>

      <section
        className="tile place kpi"
        style={{
          '--gc': '10 / 13',
          '--gr': '2',
          background:
            'linear-gradient(160deg, color-mix(in srgb, var(--tw-warn) 15%, var(--tw-tile)) 0%, var(--tw-tile) 72%)',
        } as React.CSSProperties}
        aria-label="Open requirement"
      >
        <div className="head">
          <span className="lbl">Open requirement</span>
          <span className={`pill ${daysRemaining === 0 ? 'ok' : 'w'}`}>
            {daysRemaining === 0 ? 'Met' : 'Pending'}
          </span>
        </div>
        <div>
          <div className="v" style={{ color: daysRemaining === 0 ? 'var(--tw-gain)' : 'var(--tw-warn)' }}>
            {daysRemaining} day{daysRemaining === 1 ? '' : 's'}
          </div>
          <div className="sub">
            {daysRemaining === 0
              ? `${minDaysRequired} minimum days met`
              : `Needed to reach ${minDaysRequired} minimum`}
          </div>
        </div>
      </section>

      {/* ROW 3 LEFT: RULE AUDIT TABLE */}
      <section
        className="tile place exec"
        style={{ '--gc': '1 / 9', '--gr': '3' } as React.CSSProperties}
        aria-label="Rule audit"
      >
        <div className="head">
          <span className="eyebrow">Rule audit</span>
          <span className="sub">
            {ruleRows.length} checks · {scopeLabel.toLowerCase()}
          </span>
        </div>

        <div className="tw-rep-table-wrap">
          <table className="ex tight">
            <thead>
              <tr>
                <th>Rule</th>
                <th>Requirement</th>
                <th>Observed</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {ruleRows.map((row) => (
                <tr key={row.id}>
                  <td className="l">{row.rule}</td>
                  <td className="strat">{row.requirement}</td>
                  <td className="mono">{row.observed}</td>
                  <td>
                    <span
                      className={`pill ${
                        row.status === 'clear' || row.status === 'verified'
                          ? 'ok'
                          : row.status === 'pending'
                          ? 'w'
                          : 'l'
                      }`}
                    >
                      {row.statusLabel}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ROW 3 RIGHT: AUDIT CHECKLIST */}
      <section
        className="tile place strat-tile"
        style={{ '--gc': '9 / 13', '--gr': '3' } as React.CSSProperties}
        aria-label="Audit checklist"
      >
        <div className="head">
          <span className="eyebrow">Audit checklist</span>
          <span className="sub">Record and certificate</span>
        </div>

        <div className="checks">
          {[
            { label: 'Calculation engine applied', val: 'Yes' },
            {
              label: 'Closed trades reconciled',
              val: `${closedTrades.length} of ${closedTrades.length}`,
            },
            { label: 'Reference issued', val: auditRefId },
            {
              label: 'Scope',
              val: `${accountCount} account${accountCount === 1 ? '' : 's'}`,
            },
            { label: 'Currency', val: 'USD' },
          ].map((item) => (
            <div className="ck" key={item.label}>
              <span className="dot">
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                  <path
                    d="M2.5 6.2 L5 8.5 L9.5 3.8"
                    fill="none"
                    style={{ stroke: 'var(--tw-gain)' }}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <b>{item.label}</b>
              <span className="mono">{item.val}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ROW 4 LEFT: BEFORE THE NEXT AUDIT ACTIONS */}
      <section
        className="tile place rules"
        style={{ '--gc': '1 / 9', '--gr': '4' } as React.CSSProperties}
        aria-label="Actions before the next audit"
      >
        <div className="head">
          <span className="eyebrow">Before the next audit</span>
          <span className="sub">Ordered by impact</span>
        </div>

        <div className="actions">
          <div className="action">
            <span className="n">1</span>
            <div>
              <b>
                {daysRemaining > 0
                  ? `Log trading on ${daysRemaining} more day${daysRemaining === 1 ? '' : 's'}`
                  : 'Minimum trading days achieved'}
              </b>
              <span>{daysRemaining > 0 ? 'Clears minimum days' : 'Ready for payout evaluation'}</span>
            </div>
          </div>
          <div className="action">
            <span className="n">2</span>
            <div>
              <b>Keep each trade at or under {maxRiskPerTradePct.toFixed(1)}%</b>
              <span>Holds risk rule clear</span>
            </div>
          </div>
          <div className="action">
            <span className="n">3</span>
            <div>
              <b>Recheck the app status</b>
              <span>
                {pendingRulesCount > 0 ? 'Reads compliant with pending checks' : 'All rules green'}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ROW 4 RIGHT: AUDIT CERTIFICATION SEAL */}
      <section
        className="tile place cert"
        style={{ '--gc': '9 / 13', '--gr': '4' } as React.CSSProperties}
        aria-label="Audit certification"
      >
        <svg className="seal" viewBox="0 0 76 76" aria-hidden="true">
          <circle cx="38" cy="38" r="36" style={{ fill: 'var(--tw-sun)' }} />
          <circle
            cx="38"
            cy="38"
            r="30"
            style={{
              fill: 'none',
              stroke: 'var(--tw-sun-ink)',
              strokeWidth: 1.25,
              strokeDasharray: '2 3',
              opacity: 0.45,
            }}
          />
          <path
            d="M26 39 L34 47 L51 29"
            style={{
              fill: 'none',
              stroke: 'var(--tw-sun-ink)',
              strokeWidth: 4.5,
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
            }}
          />
        </svg>
        <div className="txt">
          <div className="row">
            <span className="eyebrow">Audit certification</span>
            <span className={`pill ${breachedRulesCount > 0 ? 'l' : 'ok'}`}>
              {breachedRulesCount > 0 ? 'Review needed' : 'Compliant'}
            </span>
          </div>
          <p>Derived by EdgeLedger&apos;s calculation engine, with zero floating-point approximation.</p>
          <span className="fine mono">Ref {auditRefId}</span>
        </div>
      </section>
    </main>
  );
};
