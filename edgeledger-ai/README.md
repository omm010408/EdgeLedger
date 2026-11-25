# EDGELEDGER AI

> **Private, Personalized Trading Intelligence System & Specialized AI Trading Assistant**

---

## 1. Project Overview

**EDGELEDGER AI** is an autonomous, private trading intelligence platform designed to evolve into a specialized personal AI trading assistant. It models institutional market mechanics, proprietary trading methodologies, rigorous risk control, and trader psychology.

The AI assistant operates locally to protect proprietary trading strategies, trade journals, and financial performance data.

---

## 2. Integrated Architecture

```
edgeledger-ai/
│
├── dataset/                             # Domain datasets for Qwen instruction fine-tuning
│   ├── macro_analysis.jsonl             # DXY, Fed policy, CPI/NFP, inflation, safe-haven flows
│   ├── price_action.jsonl               # BOS, CHOCH, FVG, Order Blocks, liquidity sweeps
│   ├── risk_management.jsonl           # 4% daily drawdown, 8% max loss, sizing, R:R >= 2.0
│   ├── psychology.jsonl                # Revenge trading halt, 2-loss rule, FOMO avoidance
│   └── trade_reviews.jsonl             # Historical trade post-mortems & execution grading
│
├── training/                            # Model training & fine-tuning pipeline
│   ├── train.ipynb                      # Interactive QLoRA fine-tuning notebook for Qwen
│   └── validation.jsonl                 # Cross-domain benchmark holdout validation set
│
├── model/                               # Compiled weights & deployment artifacts
│   ├── edgeledger-trained.gguf          # Target GGUF model artifact for local Ollama execution
│   └── README.md                        # Quantization and Ollama deployment guide
│
├── evaluation/                          # Testing & benchmark metrics
│   └── test_results.json                # Benchmark test evaluation suite & rule scores
│
├── configs/                             # Structured YAML settings
│   ├── model_config.yaml                # Inference parameters, instruments, and path mappings
│   └── training_config.yaml             # LoRA/QLoRA hyperparameters and training args
│
├── src/edgeledger_ai/                   # Modular Python package
│   ├── __init__.py                      # Package entry point (v0.1.0)
│   ├── config.py                        # Typed configuration loader & path resolver
│   ├── data/                            # Dataset builders, trade parsers, validators
│   ├── knowledge/                       # SMC, Risk rules, and Instrument catalogs
│   ├── inference/                       # Local Ollama client & Hugging Face pipelines
│   ├── training/                        # LoRA setup & trainer orchestrator
│   └── evaluation/                      # Benchmark scenario definitions & scoring
│
├── scripts/                             # CLI execution entry points
│   ├── prepare_data.py                  # Ingestion & dataset compilation CLI
│   ├── run_inference.py                 # Local model tester CLI
│   ├── run_train.py                     # Fine-tuning CLI
│   └── run_eval.py                      # Benchmark scoring CLI
│
├── tests/                               # Verification suite
│   ├── __init__.py
│   └── test_config.py                   # Automated tests for paths, configs, and catalogs
│
├── .env.example                         # Environment variable template
├── .gitignore                           # Multi-tier protection (weights, keys, cache)
├── pyproject.toml                       # Python packaging configuration
├── requirements.txt                     # Lightweight runtime dependencies
├── requirements-dev.txt                 # Development dependencies
└── README.md                            # Project documentation
```

---

## 3. Core Specialization Pillars

- **Core Assets**: `XAUUSD`, `US30`, `SPX500`, `BTCUSD`.
- **Smart Money Concepts (SMC)**: Break of Structure (**BOS**), Change of Character (**CHOCH**), Fair Value Gaps (**FVG**), Order Blocks (**OB**), and Liquidity Sweeps (**BSL/SSL**).
- **Institutional Risk Guardrails**: Prop-firm rules (4% daily loss cap, 8% max trailing drawdown), position sizing, and mandatory $R:R \ge 2.0$.
- **Trading Psychology**: Emergency 2-consecutive-loss session stop, zero revenge trading tolerance.
- **Local Privacy**: Quantized GGUF running locally via Ollama (`edgeledger-trained.gguf`) with zero external data leakage.

---

## 4. Multi-Phase Roadmap

| Phase | Milestone | Description | Status |
| :--- | :--- | :--- | :---: |
| **Phase 1** | **Project Initialisation** | Integrated folder structure, Python packaging, configs, gitignore | **Completed** |
| **Phase 2** | **Dataset Curation** | Ingest custom trade reviews and expand the 5 domain JSONL files | **Completed (Baseline Seeded)** |
| **Phase 3** | **Interactive Training Setup** | Configure `training/train.ipynb` with Qwen ChatML formatting | **Completed** |
| **Phase 4** | **LoRA / QLoRA Fine-Tuning** | Execute fine-tuning on GPU when ready | Ready to Launch |
| **Phase 5** | **GGUF Export & Quantization** | Compile weights into `model/edgeledger-trained.gguf` | Awaiting Training |
| **Phase 6** | **Ollama Local Deployment** | Register `edgeledger-trained.gguf` into Ollama for private inference | Awaiting Model |
| **Phase 7** | **EDGELEDGER Integration** | Connect the local AI intelligence engine to the main EDGELEDGER web application | Future Phase |
