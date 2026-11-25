"""
Ollama Local Inference Client Placeholder.
Communicates with locally running Ollama server hosting the Qwen model family.
"""

from typing import Dict, Any, Optional, Iterator


class OllamaClient:
    """
    Client for interacting with local Ollama runtime.
    Placeholder: Full networking and streaming will be connected in future inference phase.
    """

    def __init__(
        self,
        base_url: str = "http://localhost:11434",
        model: str = "qwen2.5:7b-instruct",
        timeout: int = 120,
    ):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout = timeout

    def check_connection(self) -> Dict[str, Any]:
        """
        Placeholder: Verify if local Ollama daemon is active and responsive.
        """
        return {
            "status": "placeholder",
            "base_url": self.base_url,
            "target_model": self.model,
            "connected": False,
            "message": "Ollama connection check is deferred to future inference implementation phase.",
        }

    def generate(self, prompt: str, system: Optional[str] = None) -> str:
        """
        Placeholder: Send generation request to local Ollama API.
        """
        raise NotImplementedError(
            "Ollama inference execution is inactive during initialization phase. "
            "Model downloading and execution are deferred to future instructions."
        )

    def chat(self, messages: list, stream: bool = False) -> Iterator[str]:
        """
        Placeholder: Multi-turn chat completion using Qwen.
        """
        raise NotImplementedError(
            "Chat inference execution is inactive during initialization phase."
        )
