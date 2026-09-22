"""Story generation pipeline: chapters (Ollama) + scenes (Forge)."""
from __future__ import annotations

import asyncio
import base64
import json
import random
from typing import Any

try:
    from .config import DATA_DIR, LLM_MODEL, MAX_REROLLS, OLLAMA_URL, client, quality_preset
    from .images import build_scripts, render_image
    from .prompts import build_chapter_messages, build_image_prompt, build_reference_prompt
    from .quality import MIN_SCORE, hero_score
    from .store import BOOKS, book_dir, emit, persist
    from .storage import sync_book
except ImportError:
    from config import DATA_DIR, LLM_MODEL, MAX_REROLLS, OLLAMA_URL, client, quality_preset
    from images import build_scripts, render_image
    from prompts import build_chapter_messages, build_image_prompt, build_reference_prompt
    from quality import MIN_SCORE, hero_score
    from store import BOOKS, book_dir, emit, persist
    from storage import sync_book


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
    match is below the quality preset's gate; keeps the best attempt.
    A None score (gate unavailable) accepts the first render.
    """
    book = BOOKS[book_id]
    meta = book["meta"]
    preset = quality_preset(meta.get("quality", "balanced"))
    hero = meta["hero_desc"] or meta["hero"]
    full_prompt = build_image_prompt(
        image_prompt=image_prompt, hero_desc=hero, art_style=meta["art_style"],
        lora=meta.get("lora", ""),
    )
    scripts = await asyncio.to_thread(build_scripts, book)
    best_png: bytes | None = None
    best_score: float | None = None
    rerolls = preset["rerolls"] if preset["rerolls"] else MAX_REROLLS
    gate = preset["gate"] if preset["gate"] else MIN_SCORE
    seeds = [seed0] + [random.randint(0, 2**31 - 1) for _ in range(rerolls)]
    for attempt, seed in enumerate(seeds):
        png = await asyncio.to_thread(render_image, full_prompt, seed, scripts, preset["steps"], 768, 512)
        score = await asyncio.to_thread(hero_score, png, hero)
        print(f"[gate] book {book_id} ch{idx} attempt {attempt} seed {seed} score {score}")
        if best_png is None or (score is not None and (best_score is None or score > best_score)):
            best_png, best_score = png, score
        if score is None or score >= gate:
            break
    assert best_png is not None
    return best_png, best_score


def render_reference_options(hero_desc: str, art_style: str, seed: int, n: int = 3) -> tuple[str, list[dict[str, Any]]]:
    """Blocking: render n hero portraits under DATA_DIR/_refs/<token>/. Returns (token, options)."""
    import uuid

    token = uuid.uuid4().hex[:8]
    d = DATA_DIR / "_refs" / token
    d.mkdir(parents=True, exist_ok=True)
    prompt = build_reference_prompt(hero_desc=hero_desc, art_style=art_style)
    options = []
    for i in range(n):
        s = seed + i * 1000
        png = render_image(prompt, s)
        name = f"ref{i}.png"
        (d / name).write_bytes(png)
        options.append({"seed": s, "file": name, "url": f"/books/_refs/{token}/{name}"})
    (d / "opts.json").write_text(json.dumps({"options": [{"seed": o["seed"], "file": o["file"]} for o in options]}))
    return token, options


def adopt_reference(book_id: str) -> bool:
    """Adopt a user-picked portrait as the book's IP-Adapter ref. True if adopted."""
    book = BOOKS[book_id]
    meta = book["meta"]
    token = (meta.get("ref_token") or "").strip()
    seed = meta.get("ref_seed")
    if not token or seed is None:
        return False
    try:
        opts = json.loads((DATA_DIR / "_refs" / token / "opts.json").read_text())
        name = next((o["file"] for o in opts.get("options", []) if o.get("seed") == seed), None)
        if not name:
            return False
        png = (DATA_DIR / "_refs" / token / name).read_bytes()
        with open(book_dir(book_id) / "hero_ref.png", "wb") as f:
            f.write(png)
        book["ref_b64"] = base64.b64encode(png).decode()
        emit(book_id, {"type": "reference", "status": "done"})
        persist(book_id)
        return True
    except Exception:
        return False


def suggest(kind: str, context: dict[str, Any]) -> list[str]:
    """Blocking: ask the LLM for short suggestions (wizard chips). Always returns a list."""
    prompts = {
        "theme": "Suggest 4 original premises for a children's picture book, one sentence each.",
        "hero": f"Suggest 4 memorable hero names for a children's book about: {context.get('theme', 'an adventure')}. Names only.",
        "look": (
            f"Suggest 4 one-sentence visual descriptions for a children's book hero "
            f"named {context.get('hero', 'the hero')} in a story about: {context.get('theme', 'an adventure')}. "
            "Concrete shape and color words a picture-book artist can draw."
        ),
        "dedication": (
            f"Suggest 4 short warm book dedications (under 10 words each) "
            f"for a children's book starring {context.get('hero', 'the hero')}."
        ),
    }
    if kind not in prompts:
        raise ValueError(f"unknown suggestion kind: {kind}")
    r = client.post(
        f"{OLLAMA_URL}/v1/chat/completions",
        json={
            "model": LLM_MODEL,
            "temperature": 0.9,
            "messages": [
                {"role": "system", "content": "Reply with a JSON array of exactly 4 short strings and nothing else."},
                {"role": "user", "content": prompts[kind]},
            ],
        },
    )
    r.raise_for_status()
    raw = r.json()["choices"][0]["message"]["content"].strip()
    try:
        if raw.startswith("```"):
            raw = raw.strip("`").strip()
            if raw.lower().startswith("json"):
                raw = raw[4:].strip()
        items = json.loads(raw)
        if isinstance(items, list):
            return [str(x).strip()[:140] for x in items if str(x).strip()][:4]
    except (ValueError, KeyError, AttributeError):
        pass
    import re as _re

    lines = [_re.sub(r"^[\-\*\d\.\)\s]+", "", l).strip().strip('"') for l in raw.splitlines()]
    return [l[:140] for l in lines if len(l) > 2][:4]


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


async def preview_scene(book_id: str, idx: int, image_prompt: str, seed: int) -> bytes:
    """Fast low-res preview (8 steps, half size) with ref + LoRA applied. No gate."""
    book = BOOKS[book_id]
    meta = book["meta"]
    full_prompt = build_image_prompt(
        image_prompt=image_prompt, hero_desc=meta["hero_desc"] or meta["hero"],
        art_style=meta["art_style"], lora=meta.get("lora", ""),
    )
    scripts = await asyncio.to_thread(build_scripts, book)
    return await asyncio.to_thread(render_image, full_prompt, seed, scripts, 8, 384, 256)


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
        if meta.get("approval"):
            await _preview_and_wait(book_id, idx, data["image_prompt"])
        else:
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


async def _preview_and_wait(book_id: str, idx: int, image_prompt: str) -> None:
    """Render a preview, then wait for the user to approve (full render)."""
    book = BOOKS[book_id]
    png = await preview_scene(book_id, idx, image_prompt, book["meta"]["seed"] + idx)
    with open(book_dir(book_id) / f"pv{idx}.png", "wb") as f:
        f.write(png)
    book["chapters"][idx]["status"] = "preview"
    emit(book_id, {"type": "chapter", "idx": idx, "status": "preview"})
    persist(book_id)
    ev = asyncio.Event()
    book.setdefault("approvals", {})[idx] = ev
    await ev.wait()  # released by the approve endpoint (full render happens there)


async def run_book(book_id: str) -> None:
    book = BOOKS[book_id]
    book["status"] = "running"
    emit(book_id, {"type": "book", "status": "running"})
    if not adopt_reference(book_id):
        await generate_reference(book_id)
    for idx in range(book["meta"]["chapters"]):
        await generate_chapter(book_id, idx)
    book["status"] = "complete"
    persist(book_id)
    emit(book_id, {"type": "book", "status": "complete"})
    try:  # cover is best-effort cosmetic
        url = await generate_cover(book_id)
        emit(book_id, {"type": "cover", "status": "done" if url else "skipped"})
    except Exception as e:
        emit(book_id, {"type": "cover", "status": f"error: {type(e).__name__}"})


def pick_cover_idx(book: dict[str, Any]) -> int:
    done = [((c.get("score") if c.get("score") is not None else -1), c["idx"])
            for c in book["chapters"] if c.get("status") == "done"]
    return max(done)[1] if done else 0


def _cover_impl(book_id: str, layout: str) -> str | None:
    """Blocking: composite cover.png from the best chapter image. Returns url."""
    from PIL import Image as PILImage, ImageDraw, ImageFont

    book = BOOKS[book_id]
    meta = book["meta"]
    src = book_dir(book_id) / f"ch{pick_cover_idx(book)}.png"
    if not src.exists():
        return None
    W, H = 1024, 1024
    CREAM, INK, MUTED = (250, 247, 240), (41, 37, 36), (120, 113, 108)
    base = PILImage.new("RGB", (W, H), CREAM)
    draw = ImageDraw.Draw(base, "RGBA")
    def _font(candidates, size):
        for path in candidates:
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
        print("[cover] WARNING: no display font found, tiny fallback type in use")
        return ImageFont.load_default()

    _D = "/usr/share/fonts/truetype/dejavu/"
    title_font = _font([_D + "DejaVuSerif-Bold.ttf", _D + "DejaVuSans-Bold.ttf"], 92)
    small_font = _font([_D + "DejaVuSans.ttf", _D + "DejaVuSerif.ttf"], 34)
    print(f"[cover] fonts: {getattr(title_font, 'path', 'fallback')} / {getattr(small_font, 'path', 'fallback')}")

    def wrap(text, font, max_w):
        words, lines, cur = text.split(), [], ""
        for w in words:
            t = (cur + " " + w).strip()
            if draw.textlength(t, font=font) <= max_w or not cur:
                cur = t
            else:
                lines.append(cur)
                cur = w
        if cur:
            lines.append(cur)
        return lines

    def center(lines, font, cx, y, fill):
        step = getattr(font, "size", 12) + 10
        for line in lines:
            draw.text((cx - draw.textlength(line, font=font) / 2, y), line, font=font, fill=fill)
            y += step
        return y

    im = PILImage.open(src).convert("RGB")
    scale = max(W / im.width, H / im.height)
    im = im.resize((int(im.width * scale) + 1, int(im.height * scale) + 1))
    left, top = (im.width - W) // 2, (im.height - H) // 2
    base = im.crop((left, top, left + W, top + H)).convert("RGBA")

    band_h = 400
    shade = PILImage.new("RGBA", (W, H), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shade)
    for i in range(band_h):
        a = int(170 * i / band_h)
        y0 = (H - band_h + i) if layout == "banner" else (band_h - 1 - i)
        sdraw.line([(0, y0), (W, y0)], fill=(0, 0, 0, a))
    base = PILImage.alpha_composite(base, shade).convert("RGB")
    draw = ImageDraw.Draw(base, "RGBA")

    CREAM_TXT = (250, 247, 240)
    size = 96
    lines = wrap(meta["hero"], title_font, W - 120)
    while len(lines) > 2 and size > 48:
        size -= 8
        title_font = _font([_D + "DejaVuSerif-Bold.ttf", _D + "DejaVuSans-Bold.ttf"], size)
        lines = wrap(meta["hero"], title_font, W - 120)
    y = (H - band_h + 70) if layout == "banner" else 70
    y = center(lines, title_font, W / 2, y, CREAM_TXT) + 8
    sub = meta["theme"] + (f"  •  {meta['dedication']}" if meta.get("dedication") else "")
    center(wrap(sub, small_font, W - 140), small_font, W / 2, y, CREAM_TXT)

    base.save(book_dir(book_id) / "cover.png")
    return f"/books/{book_id}/cover.png"


async def generate_cover(book_id: str, layout: str = "banner") -> str | None:
    if layout not in ("banner", "top"):
        layout = "banner"
    return await asyncio.to_thread(_cover_impl, book_id, layout)
    try:  # permanent copy never fails the book
        urls = await asyncio.to_thread(sync_book, book_id)
        book["remote"] = urls
        emit(book_id, {"type": "remote", "status": "synced" if urls else "local-only"})
    except Exception as e:
        emit(book_id, {"type": "remote", "status": f"error: {type(e).__name__}"})
