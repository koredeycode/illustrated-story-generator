"""Hero-presence quality gate using CLIP (optional).

Scores how well a rendered image matches the hero description and lets the
caller re-roll weak renders. Fully optional: if transformers/torch/Pillow are
missing (e.g. plain local dev without the ML stack), every function degrades
to "no opinion" (None) and generation proceeds without gating.

Tuning: HERO_SCORE_MIN (default 0.23 — ViT-B/32 cosine for a decent match
typically lands 0.24-0.35). Scores print to the backend log so you can tune
from real runs.
"""
from __future__ import annotations

import io
import os

MIN_SCORE = float(os.environ.get("HERO_SCORE_MIN", "0.23"))
MODEL_ID = os.environ.get("HERO_CLIP_MODEL", "openai/clip-vit-base-patch32")

_state = {"model": None, "processor": None, "unavailable": False}


def _load():
    if _state["model"] is not None or _state["unavailable"]:
        return _state["model"] is not None
    try:
        import torch
        from transformers import CLIPModel, CLIPProcessor

        _state["processor"] = CLIPProcessor.from_pretrained(MODEL_ID)
        _state["model"] = CLIPModel.from_pretrained(MODEL_ID).eval()
        print(f"[quality] CLIP gate loaded ({MODEL_ID}), min score {MIN_SCORE}")
    except Exception as e:
        _state["unavailable"] = True
        print(f"[quality] gate disabled ({type(e).__name__}: {str(e)[:120]})")
    return _state["model"] is not None


def hero_score(image_bytes: bytes, hero_desc: str) -> float | None:
    """Cosine similarity between image and hero description, or None."""
    if not _load():
        return None
    try:
        from PIL import Image
        import torch

        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        inputs = _state["processor"](
            text=[hero_desc], images=[image], return_tensors="pt", padding=True
        )
        with torch.no_grad():
            img = _state["model"].get_image_features(pixel_values=inputs["pixel_values"])
            txt = _state["model"].get_text_features(
                input_ids=inputs["input_ids"], attention_mask=inputs["attention_mask"]
            )
            img = img / img.norm(dim=-1, keepdim=True)
            txt = txt / txt.norm(dim=-1, keepdim=True)
            return float((img @ txt.T)[0][0])
    except Exception as e:
        print(f"[quality] score failed ({type(e).__name__}: {str(e)[:120]})")
        return None
