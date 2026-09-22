"""Agentic roles on top of the Kaggle-only stack (Ollama qwen3:8b).

Roles are system prompts, not models: Planner, Writer-assist, Critic,
Art Director helper, and freeform Chat. Every blocking LLM call degrades
to a deterministic fallback when Ollama is unreachable so the UI and
tests work without a GPU.
"""
from __future__ import annotations

import json
import re
from typing import Any

try:
    from .config import LLM_MODEL, OLLAMA_URL, client
    from .templates import get_template
except ImportError:
    from config import LLM_MODEL, OLLAMA_URL, client
    from templates import get_template

PLAN_SCHEMA_HINT = (
    '{"title": "<book title>", "theme": "<1-sentence premise>", '
    '"hero": "<name>", "hero_desc": "<drawable look>", '
    '"chapters": <1-10>, "art_style": "<watercolor|pixar3d|anime|crayon|comic>", '
    '"beats": ["<one line per chapter>"]}'
)


def _strip_fences(raw: str) -> str:
    text = (raw or "").strip()
    if text.startswith("```"):
        text = text.strip("`").strip()
        if text.lower().startswith("json"):
            text = text[4:].strip()
    return text


def heuristic_plan(user_text: str, context: dict[str, Any]) -> dict[str, Any]:
    """Offline fallback plan: deterministic, always valid."""
    words = (user_text or "").strip()
    theme = words[:200] or str(context.get("theme") or "a brave little adventure")
    hero = str(context.get("hero") or "Pip")
    hero_desc = str(context.get("hero_desc") or f"{hero}, round cheerful design")
    chapters = int(context.get("chapters") or 5)
    chapters = max(1, min(10, chapters))
    book_type = str(context.get("book_type") or "picture")
    art_style = str(context.get("art_style") or "watercolor")
    beats = [f"Chapter {i + 1}: a new step in: {theme[:80]}" for i in range(chapters)]
    title = hero
    return {"title": title, "theme": theme, "hero": hero,
            "hero_desc": hero_desc, "chapters": chapters,
            "art_style": art_style, "book_type": book_type, "beats": beats,
            "offline": True}


def parse_plan_json(raw: str, fallback_ctx: dict[str, Any]) -> dict[str, Any]:
    try:
        data = json.loads(_strip_fences(raw))
        plan = heuristic_plan("", fallback_ctx)
        for k in ("title", "theme", "hero", "hero_desc", "art_style", "book_type"):
            if data.get(k):
                plan[k] = str(data[k])[:300]
        if data.get("chapters"):
            try:
                plan["chapters"] = max(1, min(10, int(data["chapters"])))
            except (TypeError, ValueError):
                pass
        if isinstance(data.get("beats"), list) and data["beats"]:
            plan["beats"] = [str(b)[:200] for b in data["beats"][:10]]
        plan.pop("offline", None)
        return plan
    except (ValueError, AttributeError, KeyError):
        plan = heuristic_plan(raw, fallback_ctx)
        return plan


def build_planner_messages(user_text: str, context: dict[str, Any]) -> list[dict]:
    tmpl = get_template(str(context.get("book_type") or "picture"))
    system = (
        "You are the Planner for an illustrated-book studio. "
        "Reply with ONE JSON object and nothing else — no markdown fences. "
        f"Schema: {PLAN_SCHEMA_HINT}. "
        f"Book type: {tmpl['label']} — {tmpl['writer_hint']} "
        "Make hero_desc drawable (shape + color words an artist can draw). "
        "Beats must have exactly <chapters> entries."
    )
    user = (
        f"User request: {user_text}\n"
        f"Hints: hero={context.get('hero', '')} chapters={context.get('chapters', 5)} "
        f"art_style={context.get('art_style', 'watercolor')} book_type={context.get('book_type', 'picture')}"
    )
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def chat_planner(user_text: str, context: dict[str, Any]) -> dict[str, Any]:
    """Blocking planner call with offline fallback."""
    try:
        r = client.post(
            f"{OLLAMA_URL}/v1/chat/completions",
            json={"model": LLM_MODEL, "temperature": 0.7,
                  "messages": build_planner_messages(user_text, context)},
        )
        r.raise_for_status()
        raw = r.json()["choices"][0]["message"]["content"]
        return parse_plan_json(raw, {**context, "theme": user_text})
    except Exception:
        return heuristic_plan(user_text, context)


def critique_chapter(text: str, meta: dict[str, Any]) -> dict[str, Any]:
    """Blocking critic: {ok, notes}. Offline fallback approves short-enough text."""
    tmpl = get_template(str(meta.get("book_type") or "picture"))
    lo, hi = tmpl["text_words"]
    words = len((text or "").split())
    offline_ok = lo * 0.5 <= words <= hi * 1.8
    try:
        r = client.post(
            f"{OLLAMA_URL}/v1/chat/completions",
            json={"model": LLM_MODEL, "temperature": 0.3, "messages": [
                {"role": "system", "content": (
                    "You are a strict children's-book editor. Reply with ONE JSON object: "
                    '{"ok": true/false, "notes": "<one line fix>"}. '
                    f"Target {lo}-{hi} words. Reject off-theme, wall-of-text, or undrawable scenes.")},
                {"role": "user", "content": f"Theme: {meta.get('theme', '')}\nText ({words} words): {text[:2000]}"},
            ]},
        )
        r.raise_for_status()
        data = json.loads(_strip_fences(r.json()["choices"][0]["message"]["content"]))
        return {"ok": bool(data.get("ok", True)), "notes": str(data.get("notes", ""))[:300]}
    except Exception:
        notes = "" if offline_ok else f"Aim for {lo}-{hi} words (now {words})."
        return {"ok": offline_ok, "notes": notes}


def chat_freeform(user_text: str, bible_md: str, history: list[dict]) -> str:
    """Blocking conversational reply grounded in BOOK.md, offline fallback."""
    try:
        msgs = [
            {"role": "system", "content": (
                "You are the Studio agent for illustrated books. Be brief (under 80 words). "
                "You can propose plans, rewrite pages, and order redraws — "
                "narrate what you will do, the UI carries the actions. "
                f"Current book bible:\n{(bible_md or '(no plan yet)')[:2500]}")},
            *[h for h in history[-8:] if h.get("role") in ("user", "assistant")],
            {"role": "user", "content": user_text},
        ]
        r = client.post(
            f"{OLLAMA_URL}/v1/chat/completions",
            json={"model": LLM_MODEL, "temperature": 0.7, "messages": msgs},
        )
        r.raise_for_status()
        return str(r.json()["choices"][0]["message"]["content"])[:1200]
    except Exception:
        low = (user_text or "").lower()
        if any(k in low for k in ("redraw", "re-draw", "picture", "image", "illustration")):
            return ("Got it — I'll re-render that scene with a fresh seed. "
                    "Watch the canvas; approve the preview when it lands.")
        if any(k in low for k in ("rewrite", "shorter", "longer", "funnier", "simpler", "chapter", "text")):
            return ("On it — I'll rewrite that page keeping the hero and art lock. "
                    "The updated text will stream into the canvas.")
        if not bible_md:
            return ("Tell me what book to make — e.g. 'a manga about a cat sailor, 6 chapters' — "
                    "and I'll draft a plan card for you to approve.")
        return ("Noted. I'll keep that with the project bible. "
                "Ask for a rewrite, a redraw, or a new plan any time.")


def detect_intent(user_text: str, has_plan: bool) -> str:
    low = (user_text or "").lower()
    if re.search(r"\b(redraw|re-draw|new picture|new image|re-render|different art)\b", low):
        return "redraw"
    if re.search(r"\b(rewrite|shorter|longer|funnier|simpler|scarier|rewrite chapter|fix text)\b", low):
        return "rewrite"
    if re.search(r"\b(plan|new book|start over|different story|make .*book|manga|cookbook|textbook|comic)\b", low):
        return "plan"
    return "plan" if not has_plan else "chat"
