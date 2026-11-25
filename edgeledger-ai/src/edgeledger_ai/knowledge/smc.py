"""
Smart Money Concepts (SMC) & Market Structure Definitions.
Defines institutional price action concepts: BOS, CHOCH, FVG, Order Blocks, Liquidity Sweeps.
"""

from dataclasses import dataclass
from enum import Enum
from typing import List, Optional


class MarketTrend(str, Enum):
    BULLISH = "BULLISH"
    BEARISH = "BEARISH"
    RANGE_BOUND = "RANGE_BOUND"


class LiquidityType(str, Enum):
    BUY_SIDE = "BUY_SIDE"       # Stop losses above equal highs or swing highs
    SELL_SIDE = "SELL_SIDE"     # Stop losses below equal lows or swing lows


@dataclass
class MarketStructureConcept:
    """Represents a foundational structural element."""
    name: str
    abbreviation: str
    description: str
    confirmation_rule: str


class SMCPatterns:
    """Domain catalog of core Smart Money Concepts."""

    BOS = MarketStructureConcept(
        name="Break of Structure",
        abbreviation="BOS",
        description="Continuation of prevailing institutional trend.",
        confirmation_rule="Full candle body close past prior significant swing point.",
    )

    CHOCH = MarketStructureConcept(
        name="Change of Character",
        abbreviation="CHOCH",
        description="First indication of shift in market structure / potential reversal.",
        confirmation_rule="Candle body close through the structural pivot that initiated the most recent high/low.",
    )

    FVG = MarketStructureConcept(
        name="Fair Value Gap",
        abbreviation="FVG",
        description="Price imbalance across 3 consecutive candles where wick 1 does not touch wick 3.",
        confirmation_rule="Unmitigated gap between candle 1 wick and candle 3 wick.",
    )

    ORDER_BLOCK = MarketStructureConcept(
        name="Order Block",
        abbreviation="OB",
        description="Last opposing candle prior to an impulsive, structure-breaking expansion.",
        confirmation_rule="Must result in a valid BOS/CHOCH and leave an imbalance/FVG.",
    )

    LIQUIDITY_SWEEP = MarketStructureConcept(
        name="Liquidity Sweep",
        abbreviation="SWEEP",
        description="Price piercing into liquidity pools followed by swift displacement in opposite direction.",
        confirmation_rule="Wick extension beyond liquidity pool with body closing back inside the range.",
    )

    @classmethod
    def get_all_concepts(cls) -> List[MarketStructureConcept]:
        return [cls.BOS, cls.CHOCH, cls.FVG, cls.ORDER_BLOCK, cls.LIQUIDITY_SWEEP]
