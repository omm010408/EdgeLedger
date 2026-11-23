# EDGELEDGER — Advanced Trading Management & Performance Intelligence Platform

> **Every Account. Every Trade. Every Rule.**

EDGELEDGER is a trading operating system designed for serious retail traders, funded prop-firm traders, and professional quantitative trading desks. Built like a financial terminal, EDGELEDGER consolidates multi-account management, enforces custom risk rulesets, manages trade allocations with partial closes, evaluates strategies, audits trader psychology, and delivers institutional-grade performance intelligence.

---

## 1. Core Architecture & Highlights

- **Visual Design:** Dark interface (`#050608` background, `#0A0D12` primary surfaces, subtle gold/amber `#D99B26` accents, `#10B981` subtle profit, `#EF4444` subtle loss).
- **Financial Calculation Integrity:** 100% decimal precision using `decimal.js`—zero floating-point inaccuracy across all P&L, balance, equity, drawdown, tick value, and R-multiple calculations.
- **Multi-Account Segregation:** Independent balance, equity, high-water mark, and ruleset monitoring for unlimited personal, broker, and prop-firm accounts (Apex, FTMO, Topstep, IC Markets, etc.).
- **Multi-Account Trade Allocation:** Allocate a single trade idea across multiple accounts simultaneously with independent position sizes, risk amounts, stop losses, and scale-out execution histories.
- **Autonomous Rule Engine:** 3-state compliance surveillance (`SAFE`, `WARNING`, `BREACHED`) for daily loss limits, relative trailing drawdown, static drawdown, profit targets, and maximum open risk.
- **Trade Execution Lifecycle:** Tracks logical trades separately from their executions, handling multiple entries, partial closes, and take-profit runners without duplicating trade ideas.
- **Outcome-Independent Psychology Scoring:** Daily debriefs that evaluate discipline, FOMO, revenge trading, and plan compliance independent of financial outcome.
- **Dual Data Layer:** Ready for enterprise **Supabase PostgreSQL with Row Level Security (RLS)**, plus built-in persistent local store with realistic institutional demo data.

---

## 2. Platform Navigation & Modules

| Module | Route | Capabilities |
| :--- | :--- | :--- |
| **Overview** | `/` | Portfolio intelligence dashboard: 14 institutional KPI metrics, cumulative equity curve, daily P&L distribution, instrument breakdown, and live trade table with multi-filter controls. |
| **Accounts** | `/accounts` | Multi-desk account provisioning, challenge phase tracking, comparative matrix (win rate, drawdowns, net gain), and per-account rule configuration editor. |
| **Trades** | `/trades` | Full execution ledger, search & filters, multi-account allocation inspector, fill history, and live partial close modal. |
| **Strategies** | `/strategies` | Systematic playbook library documenting entry triggers, exit protocols, stop-loss structural invalidations, risk rules, and setup checklists with trade attribution. |
| **Analytics** | `/analytics` | Quantitative edge diagnostics: Profit Factor, Expectancy per trade, Recovery Factor, Long vs Short directional asymmetry, session profitability, and day-of-week breakdown. |
| **Journal** | `/journal` | Daily macro framework, technical bias, post-session debrief, and psychological mistake audit (FOMO, revenge trading, moving SL, overtrading). |
| **Calendar** | `/calendar` | Interactive execution calendar mapping daily net P&L, trade frequency, win rate, and discipline score with one-click session inspection. |
| **Risk Terminal** | `/risk` | Precision position sizing calculator with exact contract specifications (XAUUSD, US30, EURUSD, BTCUSD, etc.) and pre-trade discipline compliance gates. |
| **Reports** | `/reports` | Executive tear sheets, prop-firm compliance audits, CSV transaction exporting, and CSV file import engine with validation and preview. |
| **Settings** | `/settings` | Supabase cloud database parameters, broker bridge status (MT5 ZeroMQ, cTrader Open API, TradingView Webhook listener), and contract specification manager. |

---

## 3. Technology Stack

- **Framework:** Next.js 15 (App Router, Server & Client Components)
- **Language:** TypeScript 5 (Strict Mode)
- **Styling:** Tailwind CSS with custom financial terminal theme
- **Precision Engine:** `decimal.js` (28-digit precision)
- **Visualisations:** `recharts` (Responsive SVG area, bar, and distribution charts)
- **Icons:** `lucide-react`
- **CSV Engine:** `papaparse`
- **Database:** Supabase PostgreSQL with complete Row Level Security (`supabase/migrations/`)
- **Unit Testing:** Vitest with automated financial calculation test suite

---

## 4. Financial Calculation Engine

All calculations are centralized in `src/lib/calculations/financialEngine.ts`:

- **Position Sizing:**
  $$\text{Loss Per Unit} = \frac{|\text{Entry} - \text{SL}|}{\text{Tick Size}} \times \text{Tick Value}$$
  $$\text{Position Size} = \frac{\text{Equity} \times (\text{Risk \%} / 100)}{\text{Loss Per Unit}}$$
- **Execution Net P&L:**
  $$\text{Gross P\&L} = \frac{\Delta \text{Price}}{\text{Tick Size}} \times \text{Tick Value} \times \text{Size}$$
  $$\text{Net P\&L} = \text{Gross P\&L} - \text{Commissions} - \text{Swaps} - \text{Fees}$$
- **Drawdown:**
  $$\text{Trailing DD} = \frac{\text{High Water Mark} - \text{Current Equity}}{\text{High Water Mark}} \times 100$$
- **Expectancy:**
  $$\text{Expectancy} = (\text{Win Rate} \times \text{Avg Win}) - (\text{Loss Rate} \times \text{Avg Loss})$$

---

## 5. Getting Started & Development

### Installation

```bash
npm install
```

### Run Unit Tests

```bash
npm test
```

### Production Build

```bash
npm run build
```

### Start Terminal Server

```bash
npm start
```

Visit `http://localhost:3000` in your browser.

---

## 6. Database Setup (Supabase)

To connect your own Supabase project:

1. Create a Supabase project at [supabase.com](https://supabase.com).
2. Execute the migrations located in:
   - `supabase/migrations/001_initial_schema.sql` (Creates all 16 tables, constraints, enums, and Row Level Security policies)
   - `supabase/migrations/002_seed_data.sql` (Seeds contract specifications for gold, indices, forex, and crypto)
3. Set your environment variables in `.env.local`:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

---

*Trade with structure. Manage with precision.*  
**EDGELEDGER TERMINAL OS**
