"""Forge image API: txt2img rendering + IP-Adapter reference plumbing."""
from __future__ import annotations

import base64
from typing import Any

import httpx

try:
    from .config import FORGE_URL, IP_WEIGHT, client
    from .prompts import NEGATIVE_PROMPT
except ImportError:
    from config import FORGE_URL, IP_WEIGHT, client
    from prompts import NEGATIVE_PROMPT


def render_image(prompt: str, seed: int, scripts: dict | None = None,
                 steps: int = 28, width: int = 768, height: int = 512) -> bytes:
    """Blocking Forge txt2img call — run in a thread. Returns PNG bytes."""
    payload: dict[str, Any] = {
        "prompt": prompt,
        "negative_prompt": NEGATIVE_PROMPT,
        "seed": seed,
        "steps": steps,
        "width": width,
        "height": height,
        "sampler_name": "Euler a",
    }
    if scripts:
        payload["alwayson_scripts"] = scripts
    r = client.post(f"{FORGE_URL}/sdapi/v1/txt2img", json=payload)
    r.raise_for_status()
    return base64.b64decode(r.json()["images"][0])


_IP_ADAPTER_BASE: dict | None = None
_IP_ADAPTER_CHECKED = False


def _resolve_ip_adapter() -> dict | None:
    """Find the IP-Adapter ControlNet model/preprocessor via Forge's API.

    Returns a base ControlNet unit (without image) or None. Result cached
    process-wide; any failure degrades to None (prompt lock still applies).
    Blocking — run in a thread.
    """
    global _IP_ADAPTER_BASE, _IP_ADAPTER_CHECKED
    if _IP_ADAPTER_CHECKED:
        return _IP_ADAPTER_BASE
    _IP_ADAPTER_CHECKED = True
    try:
        models = httpx.get(f"{FORGE_URL}/sdapi/v1/controlnet/model_list", timeout=15).json().get("model_list", [])
        name = next((m for m in models if m.startswith("ip-adapter_sd15")), None)
        if not name:
            print("[ip-adapter] no ip-adapter_sd15 model in Forge, disabled")
            return None
        modules = httpx.get(f"{FORGE_URL}/sdapi/v1/controlnet/module_list", timeout=15).json().get("module_list", [])
        if "ip-adapter-auto" not in modules:
            print("[ip-adapter] no ip-adapter-auto preprocessor in Forge, disabled")
            return None
        _IP_ADAPTER_BASE = {"module": "ip-adapter-auto", "model": name}
        print(f"[ip-adapter] enabled with model {name}")
    except Exception as e:
        print(f"[ip-adapter] disabled ({type(e).__name__}: {str(e)[:120]})")
        return None
    return _IP_ADAPTER_BASE


def build_scripts(book: dict[str, Any]) -> dict:
    """ControlNet/IP-Adapter scripts dict for this book, or {} if unavailable."""
    ref_b64 = book.get("ref_b64")
    base = _resolve_ip_adapter() if ref_b64 else None
    if not base:
        return {}
    return {
        "ControlNet": {
            "args": [
                {
                    "enabled": True,
                    "module": base["module"],
                    "model": base["model"],
                    "image": ref_b64,
                    "weight": IP_WEIGHT,
                    "control_mode": "Balanced",
                    "pixel_perfect": True,
                }
            ]
        }
    }
