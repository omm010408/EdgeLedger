"""
Core Trading Instruments and Asset Specifications for EDGELEDGER AI.
Focus: XAUUSD, US30, S&P 500, BTCUSD.
"""

from dataclasses import dataclass
from typing import Dict, List, Optional


@dataclass
class InstrumentSpec:
    symbol: str
    name: str
    asset_class: str
    tick_size: float
    point_value: float
    key_sessions: List[str]
    notes: str


class InstrumentCatalog:
    """Catalog of primary focus instruments."""

    XAUUSD = InstrumentSpec(
        symbol="XAUUSD",
        name="Spot Gold / US Dollar",
        asset_class="Commodity / Precious Metals",
        tick_size=0.01,
        point_value=1.0,
        key_sessions=["London Open", "NY Open", "London-NY Overlap"],
        notes="High liquidity, sensitive to DXY, real yields, and geopolitical safe-haven flows.",
    )

    US30 = InstrumentSpec(
        symbol="US30",
        name="Dow Jones Industrial Average CFD",
        asset_class="Equity Index",
        tick_size=1.0,
        point_value=1.0,
        key_sessions=["NY Open (9:30 AM EST)", "NY Session"],
        notes="Strong momentum, prone to liquidity sweeps around opening bell and economic data.",
    )

    SPX500 = InstrumentSpec(
        symbol="SPX500",
        name="S&P 500 Index CFD",
        asset_class="Equity Index",
        tick_size=0.1,
        point_value=1.0,
        key_sessions=["NY Open (9:30 AM EST)", "NY Session"],
        notes="Benchmark equity index, clean structural respect during NY institutional hours.",
    )

    BTCUSD = InstrumentSpec(
        symbol="BTCUSD",
        name="Bitcoin / US Dollar",
        asset_class="Cryptocurrency",
        tick_size=0.5,
        point_value=1.0,
        key_sessions=["24/7", "US Market Hours"],
        notes="High volatility, aggressive weekend and Asian session range expansions and liquidity runs.",
    )

    @classmethod
    def get_all(cls) -> Dict[str, InstrumentSpec]:
        return {
            "XAUUSD": cls.XAUUSD,
            "US30": cls.US30,
            "SPX500": cls.SPX500,
            "BTCUSD": cls.BTCUSD,
        }
