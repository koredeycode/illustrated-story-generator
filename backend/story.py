"""Story generation pipeline: chapters (Ollama) + scenes (Forge)."""
from __future__ import annotations

import asyncio
import base64
import json
import random
from typing import Any

try:
    from .config import LLM_MODEL, MAX_REROLLS, OLLAMA_URL, client
    from .images import build_scripts, render_image
    from .prompts import build_chapter_messages, build_image_prompt, build_reference_prompt
    from .quality import MIN_SCORE, hero_score
    from .store import BOOKS, book_dir, emit, persist
except ImportError:
    from config import LLM_MODEL, MAX_REROLLS, OLLAMA_URL, client
    from images import build_scripts, render_image
    from prompts import build_chapter_messages, build_image_prompt, build_reference_prompt
    from quality import MIN_SCORE, hero_score
    from store import BOOKS, book_dir, emit, persist


def parse_chapter_json(raw: str) -> dict[str, str]:
    text = raw.strip()
    if text.startswith("```"):
        text = text.strip("`").strip()
        if text.lower().startswith("json"):
            text = text[4:].strip()
    data = json.loads(text)
    if "text" not in data or "image_prompt" not in data:
        raise ValueError("chapter JSON missing text/image_prompt")
    return {"text": str(data["text"]), "image_prompt": str(data["image_prompt"])}


def chat_chapter(meta: dict, chapter_idx: int, previous_recap: str) -> dict[str, str]:
    """Blocking Ollama call — run in a thread. Retries once on bad JSON."""
    messages = build_chapter_messages(
        theme=meta["theme"],
        hero=meta["hero"],
        chapter_idx=chapter_idx,
        total_chapters=meta["chapters"],
        previous_recap=previous_recap,
        art_style=meta["art_style"],
    )
    last_error: Exception | None = None
    for attempt in range(2):
        msgs = messages + (
            []
            if attempt == 0
            else [{"role": "user", "content": "Return JSON only. No markdown fences."}]
        )
        r = client.post(
            f"{OLLAMA_URL}/v1/chat/completions",
            json={"model": LLM_MODEL, "messages": msgs, "temperature": 0.8},
        )
        r.raise_for_status()
        try:
            return parse_chapter_json(r.json()["choices"][0]["message"]["content"])
        except (ValueError, KeyError) as e:
            last_error = e
    raise last_error  # type: ignore[misc]


async def render_scene(book_id: str, idx: int, image_prompt: str, seed0: int) -> tuple[bytes, float | None]:
    """Render one scene with IP-Adapter ref + CLIP quality gate.

    Returns (best_png, best_score). Retries with fresh seeds while the hero
    match is below MIN_SCORE (max MAX_REROLLS); keeps the best attempt.
    A None score (gate unavailable) accepts the first render.
    """
    book = BOOKS[book_id]
    meta = book["meta"]
    hero = meta["hero_desc"] or meta["hero"]
    full_prompt = build_image_prompt(
        image_prompt=image_prompt, hero_desc=hero, art_style=meta["art_style"]
    )
    scripts = await asyncio.to_thread(build_scripts, book)
    best_png: bytes | None = None
    best_score: float | None = None
    seeds = [seed0] + [random.randint(0, 2**31 - 1) for _ in range(MAX_REROLLS)]
    for attempt, seed in enumerate(seeds):
        png = await asyncio.to_thread(render_image, full_prompt, seed, scripts)
        score = await asyncio.to_thread(hero_score, png, hero)
        print(f"[gate] book {book_id} ch{idx} attempt {attempt} seed {seed} score {score}")
        if best_png is None or (score is not None and (best_score is None or score > best_score)):
            best_png, best_score = png, score
        if score is None or score >= MIN_SCORE:
            break
    assert best_png is not None
    return best_png, best_score


async def generate_reference(book_id: str) -> None:
    """Render the one-off hero portrait used as the IP-Adapter reference."""
    book = BOOKS[book_id]
    meta = book["meta"]
    emit(book_id, {"type": "reference", "status": "drawing"})
    try:
        prompt = build_reference_prompt(
            hero_desc=meta["hero_desc"] or meta["hero"], art_style=meta["art_style"]
        )
        png = await asyncio.to_thread(render_image, prompt, meta["seed"])
        with open(book_dir(book_id) / "hero_ref.png", "wb") as f:
            f.write(png)
        book["ref_b64"] = base64.b64encode(png).decode()
        emit(book_id, {"type": "reference", "status": "done"})
    except Exception as e:  # reference is best-effort; chapters still work without it
        book["ref_b64"] = None
        emit(book_id, {"type": "reference", "status": f"error: {type(e).__name__}"})
    persist(book_id)


async def generate_chapter(book_id: str, idx: int) -> None:
    book = BOOKS[book_id]
    meta = book["meta"]
    chapters = book["chapters"]
    recap = " ".join(c["text"][-300:] for c in chapters[:idx] if c.get("text"))
    chapters[idx]["status"] = "writing"
    emit(book_id, {"type": "chapter", "idx": idx, "status": "writing"})
    try:
        data = await asyncio.to_thread(chat_chapter, meta, idx, recap)
        chapters[idx].update(text=data["text"], image_prompt=data["image_prompt"])
        chapters[idx]["status"] = "drawing"
        emit(book_id, {"type": "chapter", "idx": idx, "status": "drawing"})
        png, score = await render_scene(book_id, idx, data["image_prompt"], meta["seed"] + idx)
        with open(book_dir(book_id) / f"ch{idx}.png", "wb") as f:
            f.write(png)
        chapters[idx]["score"] = score
        chapters[idx]["status"] = "done"
        emit(book_id, {"type": "chapter", "idx": idx, "status": "done"})
    except Exception as e:  # per-chapter failure must not kill the book
        chapters[idx]["status"] = f"error: {type(e).__name__}: {e}"[:300]
        emit(book_id, {"type": "chapter", "idx": idx, "status": chapters[idx]["status"]})
    persist(book_id)


async def run_book(book_id: str) -> None:
    book = BOOKS[book_id]
    book["status"] = "running"
    emit(book_id, {"type": "book", "status": "running"})
    await generate_reference(book_id)
    for idx in range(book["meta"]["chapters"]):
        await generate_chapter(book_id, idx)
    book["status"] = "complete"
    persist(book_id)
    emit(book_id, {"type": "book", "status": "complete"})
