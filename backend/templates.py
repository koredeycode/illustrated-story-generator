"""Book-type templates: any illustrated book, one pipeline.

Each template defines page geometry, text budget, image layout, and the
extra hints given to the Writer (Ollama) and Art Director (Forge prompt).
Generation still runs on Kaggle-only stack (Ollama + Forge SD1.5).
"""
from __future__ import annotations

BOOK_TYPES: dict[str, dict] = {
    "picture": {
        "label": "Picture book",
        "blurb": "Full-bleed illustration per spread, 120-180 words per chapter. The classic.",
        "page": "landscape",
        "text_words": (120, 180),
        "layout": "full-bleed",
        "writer_hint": "Write warm picture-book prose, 120-180 words. One key visual moment per chapter.",
        "art_hint": "full-bleed children's picture-book spread, single key moment",
    },
    "comic": {
        "label": "Comic / manga",
        "blurb": "Punchy dialogue + 4-panel grid moments. Bold lines, dynamic staging.",
        "page": "portrait",
        "text_words": (40, 90),
        "layout": "4-panel grid",
        "writer_hint": "Write 40-90 words as comic beats: short dialogue lines + SFX + one panel description. Keep names out of the art prompt.",
        "art_hint": "comic page, 4-panel grid, bold outlines, dynamic staging, print-ready",
    },
    "chapter": {
        "label": "Early chapter book",
        "blurb": "Longer prose, one spot illustration per chapter. For growing readers.",
        "page": "portrait",
        "text_words": (200, 350),
        "layout": "spot illustration",
        "writer_hint": "Write 200-350 words of early-reader prose, short paragraphs. End on a hook (except the finale).",
        "art_hint": "single spot illustration above the text, airy margins, book print style",
    },
    "cookbook": {
        "label": "Cookbook / recipe book",
        "blurb": "Ingredients + numbered steps + overhead food shots per recipe-chapter.",
        "page": "portrait",
        "text_words": (120, 220),
        "layout": "photo + steps",
        "writer_hint": "Write as a recipe: title line, ingredients list, then numbered steps (120-220 words). End with a serving note.",
        "art_hint": "overhead food photography illustration, styled dish on table, appetizing, no text in image",
    },
    "textbook": {
        "label": "Textbook / how-to",
        "blurb": "Explain + diagram per chapter. Numbered steps, key terms bold.",
        "page": "portrait",
        "text_words": (150, 280),
        "layout": "diagram + explain",
        "writer_hint": "Explain one concept in 150-280 words: definition, 3 numbered steps, one worked example, one recap line.",
        "art_hint": "clean educational diagram illustration, labeled shapes, flat colors, no readable text",
    },
    "brand": {
        "label": "Brand / portfolio book",
        "blurb": "Mood-board spreads: tagline + hero visual per chapter.",
        "page": "square",
        "text_words": (30, 80),
        "layout": "hero visual",
        "writer_hint": "Write 30-80 words of confident brand copy: headline + 2 short paragraphs. No lorem ipsum.",
        "art_hint": "premium editorial spread, hero visual, generous negative space, studio lighting",
    },
}


def get_template(book_type: str) -> dict:
    return BOOK_TYPES.get(book_type or "", BOOK_TYPES["picture"])


def list_book_types() -> list[dict]:
    return [
        {"id": tid, "label": t["label"], "blurb": t["blurb"],
         "page": t["page"], "layout": t["layout"]}
        for tid, t in BOOK_TYPES.items()
    ]
