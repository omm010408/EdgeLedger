# EDGELEDGER — Architecture & Design Decisions Record (ADR)

This document records the architectural, quantitative, and product decisions made during the design and implementation of EDGELEDGER, following the conservative ambiguity principle: where specifications leave room for interpretation, choose the option that understates P&L, overstates risk, or refuses ambiguous input.

---

## 1. Conservative Ambiguity Principle

- **Rule:** Any ambiguous calculation or edge case must lean toward safety:
  1. Understate net P&L (strictly account for all commissions, swaps, fees, and negative slippage).
  2. Overstate risk (round down lot sizes to avoid unintended excess leverage; evaluate rule compliance on unrounded figures).
  3. Refuse ambiguous inputs (e.g., date formats with day/month ambiguity like `03/04/2026` in CSV import profiles without explicit format definitions).
- **Status:** Adopted permanently across all calculation modules and data ingress pipelines.

---

## 2. Separation of Trading Data from Market Research Context

- **Decision:** Personal trading records, account ledger entries, and performance calculations are strictly isolated from any external market research, signal generators, or AI forecasting tools.
- **Implementation:** Research outputs (e.g., macro sentiment bias, COT data, HTF structure) may be attached to a trade as **read-only, immutable, timestamped metadata** (`macroBiasContext`). They are never used as inputs to performance calculations or rule evaluations.

---

## 3. Position Matching & Execution Reconciliations

- **Matching Modes:**
  - **Hedging Mode (Default for FX & Prop Accounts):** Executions and partial closes match directly to their parent position allocation ID. Longs and shorts in the same symbol coexist as independent positions without netting out.
  - **Netting Mode:** Order fills match against existing open inventory using FIFO (First-In, First-Out) for closing fills and Volume-Weighted Average Price (VWAP) for scaled entries.
- **Partial Close Accounting:** A partial close links directly to the original trade allocation via `TradeExecution` record. It is never registered as a new trading idea, preventing artificial inflation of trade counts and win rates.

---

## 4. Rule Engine Four-State Model (`SAFE`, `WARNING`, `BREACHED`, `UNKNOWN`)

- **Decision:** The rule engine supports four explicit states.
- **Rule on UNKNOWN:** If required data is missing (such as an unrecorded end-of-day snapshot, a missing mark price, or an unresolvable FX rate), the rule status is marked `UNKNOWN`. **`UNKNOWN` must NEVER display as `SAFE` or allow a trade to bypass risk gates.**
- **Threshold Invariant:** The `warningThresholdPct` (default: 80% of limit consumed) must strictly be lower than the breach limit. Any configuration attempting a warning threshold >= breach limit is rejected by server-side validation.

---

## 5. Planned Risk Snapshotting & R-Multiple Integrity

- **Decision:** Planned monetary risk and planned R:R are snapshotted permanently at the instant of trade entry (`plannedRiskUsd`, `plannedRiskPct`).
- **Rationale:** If a trader moves their stop loss further away or into profit, actual risk changes, but planned risk does not. Realized R ($R = \text{Net P\&L} / \text{Planned Risk}$) is always computed against the initial planned risk, preserving the integrity of execution discipline analytics.

---

## 6. Outcome-Independent Decision Quality Scoring

- **Decision:** The decision-quality score ($1-10$) evaluates preparation, discipline, execution, risk management, and emotional control.
- **P&L Exclusion:** Financial outcome ($\text{P\&L}$ or realized $R$) is strictly excluded from this formula. A rule-breaking trade that happens to be profitable receives a penalised discipline score. Rule breaches detected by the rule engine automatically downgrade the discipline metric.

---

## 7. Sample Size Rules for Quantitative Insights

- **Decision:** Comparative analytics (e.g. Buys vs Sells, Session A vs Session B, Strategy X vs Strategy Y) require a minimum sample of $n \ge 30$ closed trades per group (configurable down to a floor of 10).
- **Rationale:** Prevents misleading statistical conclusions drawn from small sample sizes. If $n < 30$, EDGELEDGER explicitly displays "Sample size too small ($n = X$, minimum 30 required)".

---

## 8. Append-Only Account Ledger

- **Decision:** The `account_transactions` table is append-only.
- **Rationale:** Deposits, withdrawals, phase resets, realized net P&Ls, and fee adjustments are recorded as discrete ledger lines. The starting balance is immutable history. Corrections are recorded as reversing ledger entries.

---

## 9. Demo Workspace Isolation

- **Decision:** Demo accounts carry `is_demo = true`, display a persistent amber "DEMO" badge, and are excluded from live portfolio statistics by default. Users can clear demo data in a single click.

---

## 10. Non-Goals & Disclaimers

- EDGELEDGER does not place, modify, or cancel orders with brokers (no broker execution buttons).
- EDGELEDGER does not provide financial, tax, or legal advice.
- A neutral disclaimer is embedded in the application footer and on every generated PDF/CSV report:
  *"EDGELEDGER is a trading management and risk analytics tool. It does not provide financial, tax, or legal advice, nor does it guarantee compliance with third-party prop-firm terms."*
