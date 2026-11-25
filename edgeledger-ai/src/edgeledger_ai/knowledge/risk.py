"""
Risk Management & Prop Firm Rule Guardrails.
Enforces drawdown protection, position sizing limitations, and invalidation rules.
"""

from dataclasses import dataclass
from typing import Dict, Any


@dataclass
class PropFirmRiskProfile:
    account_size: float = 100_000.0
    daily_drawdown_limit_pct: float = 4.0
    max_drawdown_limit_pct: float = 8.0
    max_risk_per_trade_pct: float = 0.5
    min_rr_ratio: float = 2.0


class RiskRuleEngine:
    """Placeholder for evaluating risk parameters before setup approval."""

    def __init__(self, profile: PropFirmRiskProfile = PropFirmRiskProfile()):
        self.profile = profile

    def validate_trade_risk(
        self,
        entry: float,
        stop_loss: float,
        take_profit: float,
        risk_pct: float,
    ) -> Dict[str, Any]:
        """
        Placeholder validation check for risk limits and R:R ratio.
        """
        risk_distance = abs(entry - stop_loss)
        reward_distance = abs(take_profit - entry)
        rr_ratio = reward_distance / risk_distance if risk_distance > 0 else 0.0

        is_risk_acceptable = risk_pct <= self.profile.max_risk_per_trade_pct
        is_rr_acceptable = rr_ratio >= self.profile.min_rr_ratio

        return {
            "is_valid": is_risk_acceptable and is_rr_acceptable,
            "calculated_rr": round(rr_ratio, 2),
            "risk_pct": risk_pct,
            "max_allowed_risk_pct": self.profile.max_risk_per_trade_pct,
            "warnings": [
                *(["Exceeds max risk per trade"] if not is_risk_acceptable else []),
                *(["Below minimum R:R threshold"] if not is_rr_acceptable else []),
            ],
        }
