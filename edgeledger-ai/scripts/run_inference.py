#!/usr/bin/env python3
"""
CLI script: Run test inference with Ollama or local model.
Placeholder for future AI assistant interaction.
"""

import argparse
import sys


def main():
    parser = argparse.ArgumentParser(description="EDGELEDGER AI - Inference Tester")
    parser.add_argument("--prompt", type=str, help="Trading scenario or query prompt")
    parser.add_argument("--backend", default="ollama", choices=["ollama", "huggingface"])
    parser.add_argument("--model", default="qwen2.5:7b-instruct")
    args = parser.parse_args()

    print("=================================================================")
    print("EDGELEDGER AI - Local Inference Runner (Placeholder)")
    print("=================================================================")
    print(f"Backend : {args.backend}")
    print(f"Model   : {args.model}")
    print("\nStatus: Model downloading, training, and inference are currently inactive.")
    print("Wait for model installation and activation instructions.")
    sys.exit(0)


if __name__ == "__main__":
    main()
