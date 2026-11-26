# EdgeLedger Analytics — Metric Definitions & Open Decisions

This file documents every metric, formula, sample-size guard, reconciliation rule, and open decision implemented in `src/lib/analytics/analyticsEngine.ts` and `src/app/analytics/page.tsx`.

## 1. Metric Definitions

| Metric | Formula | Unit | Sample-Size Rule | Source Fields |
|---|---|---|---|---|
| **Net Realized P&L** | `SUM(trade.netPnl)` when scoped to `All desks`; `SUM(allocation.netPnl)` for selected desk(s) | USD (`$`) | Always shows `n`; flagged `Low sample` below `30` closed trades | `Trade.netPnl`, `TradeAllocation.netPnl` |
| **Growth (%)** | `((currentEquity - startingBalance) / startingBalance) * 100` | Percent (`%`) | Always shows desk `n`; equity vs ledger conflicts flagged in Reconciliation | `TradingAccount.currentEquity`, `TradingAccount.startingBalance` |
| **Win Rate** | `(winningClosedTrades / n) * 100` | Percent (`%`) | Always shows `n`; flagged `Low sample` below `30` | `Trade.status === "CLOSED"`, scoped `netPnl > 0` |
| **Profit Factor** | `SUM(netPnl > 0) / ABS(SUM(netPnl < 0))` | Ratio (`x`) | `n < 5` displays `Insufficient sample`; `0` losses with profit displays `No losing trades` (never capped) | Closed trades `netPnl` |
| **Expectancy ($)** | `netRealizedUsd / n` | USD (`$`) / trade | Shows `n`; `Low sample` badge for `n < 30` | Closed trades `netPnl` |
| **Expectancy (R)** | `SUM(trade.realizedR) / n` | R / trade | Shows `n`; `Low sample` badge for `n < 30` | `Trade.realizedR`, `Trade.plannedRiskUsd` |
| **Win / Loss Ratio** | `(grossWin / wins) / (ABS(grossLoss) / losses)` | Ratio (`X:1`) | `n < 5` displays `Insufficient sample`; `0` losses shows `No losing trades` | Closed trades `netPnl` |
| **Recovery Factor** | `netRealizedUsd / maxDrawdownUsd` | Ratio (`x`) | `n < 5` displays `Insufficient sample`; `maxDrawdownUsd === 0` shows `No DD` | Equity/balance peak-to-trough drawdown |
| **Sharpe & Sortino** | Annualized daily mean excess return / daily std dev (Sharpe) or downside dev (Sortino) | Ratio | Requires `>= 30` trading days; otherwise displays `Needs 30 trading days` | Closed trades grouped by UTC date |
| **Peak / Trough / Recovery** | Chronological running cumulative curve `max` (Peak), `max(peak - val)` (Trough), first date post-trough returning `>= peak` | USD & Date | Computed dynamically for both Equity and Balance series | `TradingAccount.startingBalance`, `Trade.netPnl`, `Trade.exitTime` |
| **Edge Heatmap (Weekday × Session)** | Mean `realizedR` and `n` grouped by `Mon–Fri` (UTC) × session | R / trade | Empty cells explicitly render `no trades` (never `0`); swing strategy excluded by default | `Trade.createdAt`/`entryTime`, `Trade.session`, `Trade.strategyId` |
| **Trade Quality (MAE / MFE / Capture Ratio)** | `MAE = avg(maeUsd)`, `MFE = avg(mfeUsd)`, `Capture = sum(netPnl) / sum(mfeUsd)` | USD / `%` | Hidden when `maeUsd` and `mfeUsd` fields do not exist on `Trade`; listed under `Needs fields` | Optional `Trade.maeUsd`, `Trade.mfeUsd` |

---

## 2. Explicit Data Rules & Open Conflicts (Preserved, Never Resolved Silently)

1. **Consolidated vs Per-Desk Net Gap (`$60.00`)**:
   - In the baseline 4 closed trades (`18–19 Mar 2024`), consolidated `Trade.netPnl` sums to `+$7,071.00` (`2880 + 1235 - 314 + 3270`), while `TradeAllocation.netPnl` sums to `+$7,011.00` (`Apex: +$6,090.00`, `FTMO: +$1,235.00`, `IC Markets: -$314.00`) because `tr-001` has `netPnl: 2880` vs `alloc.netPnl: 2820`. The reconciliation panel always surfaces any non-zero gap explicitly.
2. **Account Equity vs Ledger Implied P&L Conflicts**:
   - Whenever `startingBalance + sum(alloc.netPnl) !== currentEquity` (including baseline discrepancies on Apex, FTMO, or IC Markets), Analytics flags the exact mismatch in the Reconciliation panel rather than altering balances.
3. **Date Era Mismatch**:
   - Historical executions dated in `2024` rendered during `2026` are flagged explicitly in Reconciliation.
4. **Swing Strategy Session Rule**:
   - `HTF Orderflow (+$3,270.00)` / `Swing`-tagged executions are excluded by default from **Net by session** and **Edge heatmap** via a visible toggle (`Exclude swing strategies from session view`).

---

## 3. Open Decisions Log

1. **Minimum Sample Size**: Currently enforces `n < 5` -> `Insufficient sample` for ratio dividers (`Profit Factor`, `Win/Loss`, `Recovery Factor`), `n < 30` -> `Low sample` warning badge, and `< 30 trading days` -> `Needs 30 trading days` for Sharpe/Sortino. Pending sign-off on whether prop-firm evaluation review should allow configurable thresholds (e.g. `n = 20`).
2. **Firm-Rule Threshold Values per Desk**: Derived from `AccountRule` on each desk (`daily_loss_limit`, `trailing_drawdown`/`max_overall_loss`, `min_trading_days`) plus default `50%` best-day share consistency threshold, and editable inline per desk in Module 2. Confirm exact per-desk best-day cap rules (e.g., Apex 30% vs FTMO N/A).
3. **`Aqua_Funded_01` Desk Inclusion**: Any provisioned desk present in `TradingContext.accounts` (including `Aqua_Funded_01` if stored in live cloud/localStorage state) is surfaced dynamically in the Multi-Select Scope bar; desks with `0` closed trades display `n=0` cleanly, and can be toggled in/out in 1 click without distorting averages.
4. **MAE / MFE Fields**: `Trade` in `src/lib/types/financial.ts` currently does not store `maeUsd` or `mfeUsd`. Module 8 remains hidden under `Needs fields: trade.maeUsd, trade.mfeUsd` until broker webhook/execution imports capture intratrade excursion.
