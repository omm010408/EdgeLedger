"""
Configuration manager for EDGELEDGER AI.
Loads and validates settings from YAML files and environment variables.
Supports integrated dataset, training, model, and evaluation paths.
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional
import os


@dataclass
class ModelSettings:
    family: str = "qwen"
    model_name: str = "qwen2.5:7b-instruct"
    gguf_artifact: str = "model/edgeledger-trained.gguf"
    context_window: int = 8192
    temperature: float = 0.2
    top_p: float = 0.9
    max_tokens: int = 2048


@dataclass
class OllamaSettings:
    base_url: str = "http://localhost:11434"
    model_tag: str = "qwen2.5:7b-instruct"
    custom_model_tag: str = "edgeledger-ai"
    timeout_seconds: int = 120
    stream_response: bool = True


@dataclass
class ProjectPaths:
    dataset_dir: Path
    training_dir: Path
    model_dir: Path
    evaluation_dir: Path
    gguf_file: Path
    validation_file: Path
    results_file: Path


@dataclass
class RiskSettings:
    max_daily_drawdown_pct: float = 4.0
    max_total_drawdown_pct: float = 8.0
    max_risk_per_trade_pct: float = 1.0
    minimum_rr_ratio: float = 2.0


@dataclass
class EdgeLedgerConfig:
    project_name: str = "EDGELEDGER AI"
    version: str = "0.1.0"
    paths: ProjectPaths = None  # Initialized in load_config
    model: ModelSettings = field(default_factory=ModelSettings)
    ollama: OllamaSettings = field(default_factory=OllamaSettings)
    risk: RiskSettings = field(default_factory=RiskSettings)
    instruments: List[str] = field(default_factory=lambda: ["XAUUSD", "US30", "SPX500", "BTCUSD"])


def get_project_root() -> Path:
    """Return the root path of the edgeledger-ai project."""
    return Path(__file__).resolve().parent.parent.parent


def get_project_paths(root: Optional[Path] = None) -> ProjectPaths:
    """Resolve and return all primary integrated directory paths."""
    base = root or get_project_root()
    return ProjectPaths(
        dataset_dir=base / "dataset",
        training_dir=base / "training",
        model_dir=base / "model",
        evaluation_dir=base / "evaluation",
        gguf_file=base / "model" / "edgeledger-trained.gguf",
        validation_file=base / "training" / "validation.jsonl",
        results_file=base / "evaluation" / "test_results.json",
    )


def load_config(config_path: Optional[Path] = None) -> EdgeLedgerConfig:
    """
    Load configuration from YAML file with fallback to robust defaults.
    """
    root = get_project_root()
    path = config_path or (root / "configs" / "model_config.yaml")
    paths = get_project_paths(root)

    if not path.exists():
        cfg = EdgeLedgerConfig()
        cfg.paths = paths
        return cfg

    try:
        import yaml  # type: ignore
        with open(path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}

        model_data = data.get("model", {})
        ollama_data = data.get("inference", {}).get("ollama", {})
        risk_data = data.get("modules", {}).get("risk_and_prop_firm", {})
        inst_data = [i.get("symbol", "") for i in data.get("instruments", {}).get("primary", []) if "symbol" in i]

        return EdgeLedgerConfig(
            project_name=data.get("project_name", "EDGELEDGER AI"),
            version=data.get("version", "0.1.0"),
            paths=paths,
            model=ModelSettings(
                family=model_data.get("default_family", "qwen"),
                model_name=model_data.get("default_model_name", "qwen2.5:7b-instruct"),
                gguf_artifact=model_data.get("gguf_artifact", "model/edgeledger-trained.gguf"),
                context_window=model_data.get("context_window", 8192),
                temperature=model_data.get("temperature", 0.2),
                top_p=model_data.get("top_p", 0.9),
                max_tokens=model_data.get("max_tokens", 2048),
            ),
            ollama=OllamaSettings(
                base_url=os.getenv("OLLAMA_BASE_URL", ollama_data.get("base_url", "http://localhost:11434")),
                model_tag=os.getenv("OLLAMA_MODEL", ollama_data.get("model_tag", "qwen2.5:7b-instruct")),
                custom_model_tag=ollama_data.get("custom_model_tag", "edgeledger-ai"),
                timeout_seconds=ollama_data.get("timeout_seconds", 120),
                stream_response=ollama_data.get("stream_response", True),
            ),
            risk=RiskSettings(
                max_daily_drawdown_pct=risk_data.get("max_daily_drawdown_pct", 4.0),
                max_total_drawdown_pct=risk_data.get("max_total_drawdown_pct", 8.0),
                max_risk_per_trade_pct=risk_data.get("max_risk_per_trade_pct", 1.0),
                minimum_rr_ratio=risk_data.get("minimum_rr_ratio", 2.0),
            ),
            instruments=inst_data or ["XAUUSD", "US30", "SPX500", "BTCUSD"],
        )
    except Exception:
        cfg = EdgeLedgerConfig()
        cfg.paths = paths
        return cfg
