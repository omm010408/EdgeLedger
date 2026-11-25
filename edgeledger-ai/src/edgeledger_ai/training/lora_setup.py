"""
LoRA / QLoRA Configuration Helper.
Sets up parameter-efficient fine-tuning for Qwen model family.
"""

from typing import Dict, Any, List


def get_lora_config(
    r: int = 16,
    lora_alpha: int = 32,
    lora_dropout: float = 0.05,
    target_modules: List[str] = None,
) -> Dict[str, Any]:
    """
    Returns standard LoRA configuration dictionary compatible with PEFT.
    """
    if target_modules is None:
        target_modules = [
            "q_proj",
            "k_proj",
            "v_proj",
            "o_proj",
            "gate_proj",
            "up_proj",
            "down_proj",
        ]

    return {
        "r": r,
        "lora_alpha": lora_alpha,
        "lora_dropout": lora_dropout,
        "bias": "none",
        "task_type": "CAUSAL_LM",
        "target_modules": target_modules,
    }
