"""
Basic test verifying configuration loader, integrated paths, and domain catalogs.
"""

import sys
from pathlib import Path

# Add src to python path for testing
project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root / "src"))

from edgeledger_ai.config import load_config, get_project_paths
from edgeledger_ai.knowledge.smc import SMCPatterns
from edgeledger_ai.knowledge.instruments import InstrumentCatalog
from edgeledger_ai.knowledge.risk import RiskRuleEngine


def test_default_config_loading():
    config = load_config()
    assert config.project_name == "EDGELEDGER AI"
    assert "XAUUSD" in config.instruments
    assert "US30" in config.instruments
    assert "BTCUSD" in config.instruments
    assert config.model.family == "qwen"
    assert config.model.gguf_artifact == "model/edgeledger-trained.gguf"


def test_integrated_paths_exist():
    paths = get_project_paths()
    assert paths.dataset_dir.exists(), f"Missing dataset dir: {paths.dataset_dir}"
    assert paths.training_dir.exists(), f"Missing training dir: {paths.training_dir}"
    assert paths.model_dir.exists(), f"Missing model dir: {paths.model_dir}"
    assert paths.evaluation_dir.exists(), f"Missing evaluation dir: {paths.evaluation_dir}"
    assert paths.gguf_file.exists(), f"Missing gguf placeholder: {paths.gguf_file}"
    assert paths.validation_file.exists(), f"Missing validation file: {paths.validation_file}"
    assert paths.results_file.exists(), f"Missing test results: {paths.results_file}"

    # Verify all 5 dataset files exist
    expected_datasets = [
        "macro_analysis.jsonl",
        "price_action.jsonl",
        "risk_management.jsonl",
        "psychology.jsonl",
        "trade_reviews.jsonl",
    ]
    for filename in expected_datasets:
        dataset_file = paths.dataset_dir / filename
        assert dataset_file.exists(), f"Missing dataset file: {dataset_file}"
        assert dataset_file.stat().st_size > 0, f"Empty dataset file: {dataset_file}"


def test_smc_concepts():
    concepts = SMCPatterns.get_all_concepts()
    assert len(concepts) >= 5
    abbrevs = [c.abbreviation for c in concepts]
    assert "BOS" in abbrevs
    assert "CHOCH" in abbrevs
    assert "FVG" in abbrevs


def test_instrument_catalog():
    instruments = InstrumentCatalog.get_all()
    assert "XAUUSD" in instruments
    assert "US30" in instruments
    assert "SPX500" in instruments
    assert "BTCUSD" in instruments


def test_risk_rule_engine():
    engine = RiskRuleEngine()
    result = engine.validate_trade_risk(entry=100.0, stop_loss=99.0, take_profit=103.0, risk_pct=0.5)
    assert result["is_valid"] is True
    assert result["calculated_rr"] == 3.0

    invalid_result = engine.validate_trade_risk(entry=100.0, stop_loss=99.0, take_profit=103.0, risk_pct=2.0)
    assert invalid_result["is_valid"] is False


if __name__ == "__main__":
    test_default_config_loading()
    test_integrated_paths_exist()
    test_smc_concepts()
    test_instrument_catalog()
    test_risk_rule_engine()
    print("All integrated architecture baseline tests passed successfully!")
