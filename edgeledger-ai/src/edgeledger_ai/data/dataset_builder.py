"""
Dataset Builder Placeholder.
Converts trading knowledge, SMC concepts, and trade journals into JSONL training datasets.
"""

from pathlib import Path
from typing import Dict, List, Any, Optional


class DatasetBuilder:
    """
    Placeholder for compiling domain knowledge and journal logs into
    supervised instruction-tuning datasets (e.g., Qwen chat template format).
    """

    def __init__(self, raw_data_dir: Optional[Path] = None, output_dir: Optional[Path] = None):
        self.raw_data_dir = raw_data_dir
        self.output_dir = output_dir

    def load_knowledge_files(self) -> List[Dict[str, Any]]:
        """Placeholder: Load markdown and JSON knowledge representations."""
        # Future implementation will parse files from data/raw/knowledge/
        return []

    def load_trade_journals(self) -> List[Dict[str, Any]]:
        """Placeholder: Load historical trades from data/raw/journals/."""
        # Future implementation will extract logged setups, metrics, and outcomes
        return []

    def format_training_sample(self, instruction: str, input_text: str, output_text: str) -> Dict[str, str]:
        """Placeholder: Format a single sample into conversational structure."""
        return {
            "instruction": instruction,
            "input": input_text,
            "output": output_text,
        }

    def build_dataset(self) -> None:
        """Placeholder: Compile and write train/val splits to data/processed/."""
        raise NotImplementedError(
            "Dataset construction pipeline will be implemented in a future phase. "
            "Model training and dataset building are currently inactive."
        )
