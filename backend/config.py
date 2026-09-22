"""Shared settings and HTTP client (env-driven)."""
from __future__ import annotations

import os
from pathlib import Path

import httpx

MAX_REROLLS = int(os.environ.get("HERO_REROLLS", "2"))
IP_WEIGHT = float(os.environ.get("IP_ADAPTER_WEIGHT", "0.7"))

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")
FORGE_URL = os.environ.get("FORGE_URL", "http://127.0.0.1:7860")
LLM_MODEL = os.environ.get("LLM_MODEL", "qwen3:8b")
DATA_DIR = Path(os.environ.get("DATA_DIR", Path(__file__).parent.parent / "books"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

client = httpx.Client(timeout=600.0)
