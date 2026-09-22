"""Shared settings and HTTP client (env-driven)."""
from __future__ import annotations

import os
from pathlib import Path

import httpx

MAX_REROLLS = int(os.environ.get("HERO_REROLLS", "2"))
IP_WEIGHT = float(os.environ.get("IP_ADAPTER_WEIGHT", "0.7"))

# Rendering defaults (overridden per-book by the quality preset).
CFG = float(os.environ.get("RENDER_CFG", "7"))
SAMPLER = os.environ.get("RENDER_SAMPLER", "DPM++ 2M")

QUALITY_PRESETS = {
    "draft": {"steps": 20, "rerolls": 1, "gate": 0.20},
    "balanced": {"steps": 32, "rerolls": 2, "gate": 0.26},
    "best": {"steps": 40, "rerolls": 3, "gate": 0.28},
}


def quality_preset(name: str) -> dict:
    return QUALITY_PRESETS.get(name or "", QUALITY_PRESETS["balanced"])

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")
FORGE_URL = os.environ.get("FORGE_URL", "http://127.0.0.1:7860")
LLM_MODEL = os.environ.get("LLM_MODEL", "qwen3:8b")
DATA_DIR = Path(os.environ.get("DATA_DIR", Path(__file__).parent.parent / "books"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

client = httpx.Client(timeout=600.0)
