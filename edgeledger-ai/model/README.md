# EDGELEDGER AI — Model Artifacts Directory

This directory is the deployment destination for compiled and quantized model weights.

## Target Artifact: `edgeledger-trained.gguf`

- **Architecture**: Qwen2.5 (e.g. 7B / 14B / 32B Instruct) fine-tuned with LoRA/QLoRA on EDGELEDGER datasets.
- **Quantization Target**: GGUF Q4_K_M or Q8_0 for local GPU/CPU execution via Ollama or `llama.cpp`.
- **Local Deployment via Ollama**:
  ```bash
  # Step 1: Create an Ollama Modelfile pointing to this artifact:
  # FROM ./edgeledger-trained.gguf
  
  # Step 2: Build and run the private model:
  ollama create edgeledger-ai -f Modelfile
  ollama run edgeledger-ai
  ```

> [!NOTE]
> Per project initialization instructions, no models have been trained or downloaded yet. The file `edgeledger-trained.gguf` is reserved as the export destination from `training/train.ipynb`.
