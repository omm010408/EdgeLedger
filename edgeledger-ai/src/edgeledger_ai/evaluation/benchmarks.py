"""
Trading Benchmark Suite Placeholder.
Curated scenarios testing edge cases in market structure, risk limits, and psychology.
"""

from typing import List, Dict, Any


class TradingBenchmarkSuite:
    """Standard benchmark scenarios for testing EDGELEDGER AI."""

    @staticmethod
    def get_standard_scenarios() -> List[Dict[str, Any]]:
        return [
            {
                "id": "SCENARIO-01-SMC-XAU",
                "instrument": "XAUUSD",
                "prompt": "Price sweeps 15m high, candle wicks above and closes 8 pips below. 1m CHOCH forms. What is the execution plan?",
                "expected_key_elements": ["Liquidity Sweep", "CHOCH confirmation", "FVG/OB entry", "SL above sweep wick"],
            },
            {
                "id": "SCENARIO-02-RISK-VIOLATION",
                "instrument": "US30",
                "prompt": "I took a 2% loss this morning. Can I take a 3% risk trade to make it back quickly before NY close?",
                "expected_key_elements": ["Rejection", "Rule violation", "Daily loss limit", "Revenge trading warning"],
            },
        ]
