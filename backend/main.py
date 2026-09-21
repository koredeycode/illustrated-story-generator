"""Illustrated Story Generator backend.

Serves the React frontend (../frontend/dist) and a JSON API that orchestrates
story writing (Ollama) + illustration (Forge txt2img API).

Env:
  OLLAMA_URL  default http://127.0.0.1:11434
  FORGE_URL   default http://127.0.0.1:7860
  LLM_MODEL   default qwen3:8b
  DATA_DIR    default <repo>/books (on Kaggle: /kaggle/working/books)

Run locally:  uvicorn main:app --port 8000   (from backend/)
"""
from __future__ import annotations

import asyncio
import base64
import html
import json
import os
import random
import uuid
from pathlib import Path
from typing import Any

import httpx
from fastapi import HTTPException
from fastapi import FastAPI
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

try:  # `uvicorn main:app` from backend/
    from prompts import (
        NEGATIVE_PROMPT,
        STYLE_SUFFIXES,
        build_chapter_messages,
        build_image_prompt,
    )
except ImportError:  # `uvicorn backend.main:app` from repo root
    from backend.prompts import (
        NEGATIVE_PROMPT,
        STYLE_SUFFIXES,
        build_chapter_messages,
        build_image_prompt,
    )

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")
FORGE_URL = os.environ.get("FORGE_URL", "http://127.0.0.1:7860")
LLM_MODEL = os.environ.get("LLM_MODEL", "qwen3:8b")
DATA_DIR = Path(os.environ.get("DATA_DIR", Path(__file__).parent.parent / "books"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

client = httpx.Client(timeout=600.0)

app = FastAPI(title="Illustrated Story Generator")

# book_id -> {"meta": dict, "chapters": [dict], "status": str, "subscribers": [asyncio.Queue]}
BOOKS: dict[str, dict[str, Any]] = {}


# ---------- models ----------


class StoryCreate(BaseModel):
    theme: str = Field(min_length=3, max_length=500)
    hero: str = Field(min_length=1, max_length=100)
    hero_desc: str = Field(default="", max_length=300)
    chapters: int = Field(default=5, ge=1, le=10)
    art_style: str = "watercolor"
    seed: int = 42


class Regenerate(BaseModel):
    chapter_idx: int = Field(ge=0)
    seed: int | None = None


# ---------- helpers ----------


def book_dir(book_id: str) -> Path:
    d = DATA_DIR / book_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def persist(book_id: str) -> None:
    book = BOOKS[book_id]
    with open(book_dir(book_id) / "book.json", "w") as f:
        json.dump({"meta": book["meta"], "chapters": book["chapters"]}, f, indent=2)


def emit(book_id: str, event: dict[str, Any]) -> None:
    """Fan-out to all SSE subscribers of a book (per-client queues)."""
    book = BOOKS.get(book_id)
    if book:
        for q in book["subscribers"]:
            q.put_nowait(event)


def ensure_book(book_id: str) -> dict[str, Any]:
    """Return in-memory book, lazily reloading from DATA_DIR after a restart."""
    book = BOOKS.get(book_id)
    if book is None:
        path = DATA_DIR / book_id / "book.json"
        if not path.exists():
            raise HTTPException(404, "unknown book")
        with open(path) as f:
            saved = json.load(f)
        # Only finished state is persisted; running jobs don't survive a restart.
        book = {
            "meta": saved["meta"],
            "chapters": saved["chapters"],
            "status": "complete",
            "subscribers": [],
        }
        BOOKS[book_id] = book
    return book


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


def render_image(prompt: str, seed: int) -> bytes:
    """Blocking Forge txt2img call — run in a thread. Returns PNG bytes."""
    r = client.post(
        f"{FORGE_URL}/sdapi/v1/txt2img",
        json={
            "prompt": prompt,
            "negative_prompt": NEGATIVE_PROMPT,
            "seed": seed,
            "steps": 28,
            "width": 768,
            "height": 512,
            "sampler_name": "Euler a",
        },
    )
    r.raise_for_status()
    return base64.b64decode(r.json()["images"][0])


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
        full_prompt = build_image_prompt(
            image_prompt=data["image_prompt"],
            hero_desc=meta["hero_desc"] or meta["hero"],
            art_style=meta["art_style"],
        )
        png = await asyncio.to_thread(render_image, full_prompt, meta["seed"] + idx)
        with open(book_dir(book_id) / f"ch{idx}.png", "wb") as f:
            f.write(png)
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
    for idx in range(book["meta"]["chapters"]):
        await generate_chapter(book_id, idx)
    book["status"] = "complete"
    persist(book_id)
    emit(book_id, {"type": "book", "status": "complete"})


def public_book(book_id: str) -> dict[str, Any]:
    book = BOOKS[book_id]
    d = book_dir(book_id)
    chapters = [
        {**c, "image_url": f"/books/{book_id}/ch{c['idx']}.png" if (d / f"ch{c['idx']}.png").exists() else None}
        for c in book["chapters"]
    ]
    return {"id": book_id, "meta": book["meta"], "status": book["status"], "chapters": chapters}


# ---------- api ----------


async def _probe(url: str) -> str:
    try:
        r = await asyncio.to_thread(httpx.get, url, timeout=5)
        return "ok" if r.status_code == 200 else "down"
    except Exception:
        return "down"


@app.get("/api/health")
async def health() -> dict[str, Any]:
    ollama, forge = await asyncio.gather(
        _probe(f"{OLLAMA_URL}/v1/models"),
        _probe(f"{FORGE_URL}/sdapi/v1/sd-models"),
    )
    return {"backend": "ok", "ollama": ollama, "forge": forge}


@app.get("/api/styles")
def styles() -> list[str]:
    return list(STYLE_SUFFIXES)


@app.post("/api/story", status_code=201)
async def create_story(spec: StoryCreate) -> dict[str, Any]:
    book_id = uuid.uuid4().hex[:8]
    meta = spec.model_dump()
    if spec.art_style not in STYLE_SUFFIXES:
        raise HTTPException(400, f"unknown art_style, choose from {list(STYLE_SUFFIXES)}")
    BOOKS[book_id] = {
        "meta": meta,
        "chapters": [{"idx": i, "text": "", "image_prompt": "", "status": "queued"} for i in range(spec.chapters)],
        "status": "running",
        "subscribers": [],
    }
    persist(book_id)
    asyncio.create_task(run_book(book_id))
    return {"id": book_id, "status": "running"}


@app.get("/api/story/{book_id}")
def get_story(book_id: str) -> dict[str, Any]:
    ensure_book(book_id)
    return public_book(book_id)


@app.get("/api/story/{book_id}/events")
async def story_events(book_id: str) -> StreamingResponse:
    book = ensure_book(book_id)
    queue: asyncio.Queue = asyncio.Queue()
    book["subscribers"].append(queue)

    async def gen():
        try:
            yield f"data: {json.dumps({'type': 'snapshot', 'book': public_book(book_id)})}\n\n"
            if book["status"] == "complete":
                yield f"data: {json.dumps({'type': 'book', 'status': 'complete'})}\n\n"
                return
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=25)
                    yield f"data: {json.dumps(event)}\n\n"
                    if event.get("type") == "book" and event.get("status") == "complete":
                        return
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        finally:
            book["subscribers"].remove(queue)

    return StreamingResponse(gen(), media_type="text/event-stream")


@app.post("/api/story/{book_id}/regenerate")
async def regenerate(book_id: str, req: Regenerate) -> dict[str, Any]:
    book = ensure_book(book_id)
    if not (0 <= req.chapter_idx < len(book["chapters"])):
        raise HTTPException(400, "chapter_idx out of range")
    ch = book["chapters"][req.chapter_idx]
    if book["status"] == "running" and ch.get("status") != "done":
        raise HTTPException(409, "chapter still generating — wait for it to finish")
    meta = book["meta"]
    seed = req.seed if req.seed is not None else random.randint(0, 2**31 - 1)
    if not ch.get("image_prompt"):
        raise HTTPException(400, "chapter has no image prompt yet")
    full_prompt = build_image_prompt(
        image_prompt=ch["image_prompt"],
        hero_desc=meta["hero_desc"] or meta["hero"],
        art_style=meta["art_style"],
    )
    ch["status"] = "drawing"
    emit(book_id, {"type": "chapter", "idx": req.chapter_idx, "status": "drawing"})
    try:
        png = await asyncio.to_thread(render_image, full_prompt, seed)
        with open(book_dir(book_id) / f"ch{req.chapter_idx}.png", "wb") as f:
            f.write(png)
        ch["status"] = "done"
    except Exception as e:
        ch["status"] = f"error: {type(e).__name__}: {e}"[:300]
    persist(book_id)
    emit(book_id, {"type": "chapter", "idx": req.chapter_idx, "status": ch["status"]})
    return {"idx": req.chapter_idx, "status": ch["status"]}


@app.get("/api/story/{book_id}/export", response_class=HTMLResponse)
def export_book(book_id: str) -> str:
    ensure_book(book_id)
    book = public_book(book_id)
    hero = html.escape(book["meta"]["hero"])
    theme = html.escape(book["meta"]["theme"])
    pages = "\n".join(
        f"<section><h2>Chapter {c['idx'] + 1}</h2>"
        + (f"<img src=\"{c['image_url']}\"/>" if c["image_url"] else "<p><em>(image pending)</em></p>")
        + f"<p>{html.escape(c['text']) if c['text'] else '<em>(text pending)</em>'}</p></section>"
        for c in book["chapters"]
    )
    return (
        "<!doctype html><html><head><meta charset=utf-8>"
        f"<title>{hero} — {theme}</title>"
        "<style>body{font-family:Georgia,serif;max-width:720px;margin:auto;padding:2rem}"
        "img{width:100%;border-radius:8px}section{margin-bottom:3rem}</style>"
        f"</head><body><h1>{hero}</h1><p>{theme}</p>"
        f"{pages}</body></html>"
    )


# ---------- static (frontend build + book images). Registered last. ----------

app.mount("/books", StaticFiles(directory=str(DATA_DIR)), name="books")

DIST = Path(__file__).parent.parent / "frontend" / "dist"
if DIST.exists():
    app.mount("/", StaticFiles(directory=str(DIST), html=True), name="frontend")
else:

    @app.get("/")
    def no_frontend() -> dict[str, str]:
        return {"message": "backend ok — frontend/dist not built yet"}
