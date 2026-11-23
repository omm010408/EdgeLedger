# EDGELEDGER — Financial Calculation Specifications

All financial, risk, and performance calculations in EDGELEDGER are centralized in `src/lib/calculations/financialEngine.ts` and use `decimal.js` with 28-digit precision. Floating-point arithmetic (`number`) is prohibited in calculation code.

---

## 1. Core Financial Terms & Formulas

### 1.1 Account Balance
$$\text{Balance} = \text{Starting Balance} + \sum \text{Deposits} - \sum \text{Withdrawals} + \sum \text{Realized Net P\&L} + \sum \text{Ledger Adjustments}$$
- Balance changes exclusively via immutable ledger records in `account_transactions`.

### 1.2 Account Equity
$$\text{Equity} = \text{Balance} + \sum \text{Floating (Unrealized) Net P\&L}$$
- Floating P&L is calculated using the latest mark price from the data feed, converted to the account's base currency using the active exchange rate.

### 1.3 Realized Net P&L of a Closing Execution
$$\text{Gross P\&L} = \text{Direction Sign} \times (\text{Exit Price} - \text{Entry Price}) \times \frac{\text{Tick Value}}{\text{Tick Size}} \times \text{Position Size}$$
$$\text{Net P\&L} = \text{Gross P\&L} - \text{Commission} - \text{Swap} - \text{Fees}$$
- $\text{Direction Sign} = +1$ for `BUY` (Long), $-1$ for `SELL` (Short).
- Commissions, swaps, and fees are treated as negative deductions from gross profit.

### 1.4 Position Sizing Formula
$$\text{Monetary Risk} = \text{Account Equity} \times \left(\frac{\text{Risk Percentage}}{100}\right)$$
$$\text{Loss Per Unit} = \frac{|\text{Entry Price} - \text{Stop Loss Price}|}{\text{Tick Size}} \times \text{Tick Value}$$
$$\text{Raw Position Size} = \frac{\text{Monetary Risk}}{\text{Loss Per Unit}}$$
$$\text{Actual Position Size} = \lfloor \text{Raw Position Size} / \text{Lot Step} \rfloor \times \text{Lot Step}$$
- Rounding down ensures that the trader's actual monetary risk is strictly $\le$ planned monetary risk.
- The actual risk after rounding down is reported explicitly.

---

## 2. Drawdown & Loss Calculations

### 2.1 Static Drawdown
$$\text{Static Floor} = \text{Starting Balance} \times (1 - \text{Max Loss \%} / 100)$$
$$\text{Current Drawdown} = \max(0, \text{Starting Balance} - \text{Current Value})$$
- Static floor is immutable; it does not move upward when profits are realized.

### 2.2 Trailing Equity Drawdown (Intraday Peak Reference)
$$\text{High-Water Mark (HWM)} = \max(\text{HWM}_{\text{prior}}, \text{Current Equity})$$
$$\text{Trailing Floor} = \text{HWM} \times (1 - \text{Trailing Limit \%} / 100)$$
$$\text{Remaining Allowance} = \text{Current Equity} - \text{Trailing Floor}$$
- **State Evaluation:**
  - If $\text{Remaining Allowance} \le 0$: `BREACHED`
  - If $\text{Consumed Drawdown} \ge \text{Warning Threshold}$: `WARNING`
  - Otherwise: `SAFE` (or `UNKNOWN` if mark prices/snapshots are unavailable).

### 2.3 Daily Loss Limit
$$\text{Daily Baseline} = \text{Day Starting Equity or Balance (per ruleset)}$$
$$\text{Daily Decline} = \max(0, \text{Daily Baseline} - \text{Current Intraday Value})$$
$$\text{Remaining Daily Allowance} = \text{Daily Limit} - \text{Daily Decline}$$
- The reset boundary is governed strictly by the ruleset's configured timezone (e.g., `America/New_York` at 17:00 EST or `Europe/Prague` at 00:00 CET).

---

## 3. Worked Golden Fixtures (Automated Verification)

### Worked Fixture 1: Trailing Equity Drawdown (Intraday)
- **Account:** Starting balance = \$10,000.00.
- **Rule:** 5% trailing equity drawdown, measured intraday.
- **Scenario:**
  1. Account equity peaks at \$10,400.00.
     $$\text{High-Water Mark} = \$10,400.00$$
     $$\text{Floor} = \$10,400.00 \times (1 - 0.05) = \$9,880.00$$
  2. Equity subsequently declines to \$10,100.00.
     $$\text{Remaining Allowance} = \$10,100.00 - \$9,880.00 = \$220.00$$
  3. Status = `SAFE` (or `WARNING` if warning threshold is 80% consumed: consumed is \$300 of \$520 allowance = 57.7%).

### Worked Fixture 2: Balance-Based Trailing at End-of-Day
- **Account:** Starting balance = \$100,000.00.
- **Rule:** 4% trailing balance drawdown, evaluated at end of trading day.
- **Scenario:**
  1. Day 1 closing balance = \$102,500.00.
     $$\text{Floor} = \$102,500.00 \times 0.96 = \$98,400.00$$
  2. Day 2 closing balance = \$99,100.00.
     $$\text{Remaining Allowance} = \$99,100.00 - \$98,400.00 = \$700.00$$

---

## 4. Performance Statistics

- **Profit Factor:**
  $$\text{Profit Factor} = \frac{\text{Gross Profit}}{|\text{Gross Loss}|}$$
  - *Edge Case:* If $\text{Gross Loss} = 0$, display `"No losses"` (never `Infinity`).
- **Expectancy (R):**
  $$\text{Expectancy (R)} = (\text{Win Rate} \times \text{Avg Winning R}) - (\text{Loss Rate} \times |\text{Avg Losing R}|)$$
  - Breakeven trades ($R = 0$) are reported separately and excluded from win/loss rates.
- **Recovery Factor:**
  $$\text{Recovery Factor} = \frac{\text{Net Profit}}{|\text{Maximum Drawdown}|}$$
  - *Edge Case:* If maximum drawdown is 0, display `"Undefined (Zero Drawdown)"`.
- **Sharpe Ratio:**
  $$\text{Sharpe} = \frac{\text{Mean Daily Return} - \text{Risk Free Rate}}{\text{Std Dev Daily Return}} \times \sqrt{252}$$
  - *Sample Requirement:* Requires $\ge 30$ trading days of snapshot data. If days $< 30$, display `"Insufficient data (n < 30)"`.
- **Decision-Quality Score Formula:**
  $$\text{Score} = 0.35 \times \text{Discipline} + 0.25 \times \text{Risk Management} + 0.20 \times \text{Execution} + 0.10 \times \text{Preparation} + 0.10 \times \text{Emotional Control}$$
  - P&L and financial outcome are 100% excluded.
