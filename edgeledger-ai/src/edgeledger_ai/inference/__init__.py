"""
Inference interfaces for EDGELEDGER AI.
Supports Ollama local inference and Hugging Face pipelines.
"""

from .ollama_client import OllamaClient
from .hf_pipeline import HFPipeline

__all__ = ["OllamaClient", "HFPipeline"]
