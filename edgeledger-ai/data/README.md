# EDGELEDGER AI - Dataset Architecture & Knowledge Base

This directory houses all domain intelligence, trading strategies, historical trade records, and formatted training datasets for **EDGELEDGER AI**.

---

## Directory Organization

```
data/
├── raw/
│   ├── knowledge/               # Domain concepts, methodologies, and rules
│   │   ├── methodology/         # Market structure, SMC (BOS, CHOCH, FVG, OB, sweeps)
│   │   ├── psychology/          # Emotional discipline, mental frameworks, execution rules
│   │   ├── risk_management/     # Prop-firm rules, max drawdown, position sizing
│   │   └── macro/               # Fundamental drivers, DXY correlation, interest rates
│   └── journals/                # Historical trade journals, execution logs (gitignored)
├── processed/
│   ├── training/                # Formatted JSONL instruction datasets for training
│   └── validation/              # Holdout evaluation sets for benchmark testing
└── templates/                   # Standard prompt & conversation schemas
```

---

## Data Schema Standards

### 1. Instruction-Tuning Pair Format (`Alpaca / ShareGPT / OpenAI Chat`)

Training datasets in `data/processed/training/` should follow a standard conversational or instruction schema:

```json
{
  "system": "You are EDGELEDGER AI, an elite trading intelligence assistant specializing in smart money concepts, strict risk management, and prop firm discipline.",
  "instruction": "Analyze this trade setup on XAUUSD following a liquidity sweep.",
  "input": "Timeframe: 15m. Asia high swept at 2650.00. 5m CHOCH formed with candle close below 2642.00 leaving an FVG between 2645.00 - 2647.50. Risk budget is 0.5% on a $100,000 funded account.",
  "output": "Setup Analysis:\n1. Market Structure: 15m Liquidity sweep confirmed above Asian session high (2650.00).\n2. Confirmation: 5m CHOCH confirmed with body close below 2642.00.\n3. Entry Zone: Premium Fair Value Gap (FVG) at 2645.00 - 2647.50.\n4. Invalidation / Stop Loss: Above the sweep high at 2651.00.\n5. Target / Take Profit: Recent internal sell-side liquidity at 2632.00 (Risk-to-Reward ~ 3.5R).\n6. Risk Management: Max risk $500 (0.5%). Position size calculated according to 55-pip SL.\nExecution Verdict: Valid high-probability institutional short."
}
```

### 2. Trade Journal Input Schema (`data/raw/journals/`)

When logging completed trades from EDGELEDGER, record:
- **Symbol**: `XAUUSD`, `US30`, `SPX500`, `BTCUSD`
- **Direction**: `Long` / `Short`
- **Setup Type**: `Sweep + CHOCH`, `OB Re-test`, `FVG Continuation`
- **Risk / Reward**: Planned vs Realized
- **Execution Quality**: Adherence to plan (1-10)
- **Psychology Tags**: `Patient`, `FOMO Avoided`, `Early Exit`, `Disciplined`

---

## Data Privacy & Security

> [!IMPORTANT]
> Actual account credentials, live account balances, proprietary trade logs, and private journal entries placed in `data/raw/journals/` and `data/processed/` are strictly **gitignored** to prevent accidental leaks.
