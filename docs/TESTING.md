# EDGELEDGER — Testing Strategy & Verification Protocols

This document outlines the testing architecture, fixture validations, property-based invariants, and security verification standards required for EDGELEDGER.

---

## 1. Test Suite Architecture

- **Framework:** Vitest (`vitest run`).
- **Test File Location:** `src/lib/calculations/__tests__/financialEngine.test.ts`.
- **Target Coverage:**
  1. Position sizing across asset classes (Forex, Metals, Indices, Crypto).
  2. Execution P&L reconciliation with fees, swaps, and commissions.
  3. Golden Fixtures from Section 6 of product specification.
  4. Rule state transitions across `SAFE`, `WARNING`, `BREACHED`, and `UNKNOWN`.
  5. Statistical metrics with zero-division edge cases.
  6. Invariants for partial closes and ledger balance additivity.

---

## 2. Invariants & Property-Based Tests

1. **Additivity of Partial Closes:**
   $$\sum_{i} \text{Execution Realized Net P\&L}_i = \text{Total Trade Allocation Net P\&L}$$
2. **Reversibility of Ledger Adjustments:**
   $$\text{Balance}_{\text{after}} - \text{Transaction Amount} = \text{Balance}_{\text{prior}}$$
3. **Drawdown Non-Negativity:**
   $$\text{Drawdown} \ge 0 \quad \forall t$$
4. **Lot Step Discretization:**
   $$\text{Calculated Lot Size} \pmod{\text{Lot Step}} = 0$$
5. **Warning Stricter Than Breach:**
   $$\text{Warning Threshold Value} < \text{Breach Limit Value}$$

---

## 3. Row Level Security (RLS) Cross-Tenant Isolation

- Every table in PostgreSQL has RLS enabled with explicit tenant filtering:
  `USING (auth.uid() = user_id)` or child-to-parent existence query.
- Service role keys are prohibited in the client-side bundle.
- Cross-tenant test requirement: A request by User B querying User A's `account_id` or `trade_id` returns 0 rows / 403 Forbidden.

---

## 4. Accessibility Testing (WCAG 2.2 AA)

- Color is never the sole communicator of state (P&L uses +/- signs, arrows, and tags; rule states use icons and text labels).
- Contrast ratio checks:
  - White primary text (`#FFFFFF`) on `#050608` background: **20.5:1** (Passes AAA).
  - Secondary text (`#8B9BB4`) on `#0A0D12` surface: **6.2:1** (Passes AA).
  - Profit text (`#10B981`) on dark surface: **6.8:1** (Passes AA).
  - Loss text (`#EF4444`) on dark surface: **4.6:1** (Passes AA).
- All buttons and inputs feature explicit keyboard focus rings (`focus:ring-2 focus:ring-edge-accent`).
