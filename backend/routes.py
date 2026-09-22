"""HTTP API: health, books, SSE events, regeneration, export."""
from __future__ import annotations

import asyncio
import html
import json
import random
import re
import uuid
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse, Response, StreamingResponse
from pydantic import BaseModel, Field

try:
    from .config import FORGE_URL, OLLAMA_URL
    from .pdf_export import render_pdf
    from .prompts import STYLE_SUFFIXES
    from .store import BOOKS, book_dir, emit, ensure_book, persist, public_book
    from .story import render_scene, run_book
except ImportError:
    from config import FORGE_URL, OLLAMA_URL
    from pdf_export import render_pdf
    from prompts import STYLE_SUFFIXES
    from store import BOOKS, book_dir, emit, ensure_book, persist, public_book
    from story import render_scene, run_book

router = APIRouter()


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


async def _probe(url: str) -> str:
    try:
        r = await asyncio.to_thread(httpx.get, url, timeout=5)
        return "ok" if r.status_code == 200 else "down"
    except Exception:
        return "down"


@router.get("/api/health")
async def health() -> dict[str, Any]:
    ollama, forge = await asyncio.gather(
        _probe(f"{OLLAMA_URL}/v1/models"),
        _probe(f"{FORGE_URL}/sdapi/v1/sd-models"),
    )
    return {"backend": "ok", "ollama": ollama, "forge": forge}


@router.get("/api/styles")
def styles() -> list[str]:
    return list(STYLE_SUFFIXES)


@router.post("/api/story", status_code=201)
async def create_story(spec: StoryCreate) -> dict[str, Any]:
    book_id = uuid.uuid4().hex[:8]
    meta = spec.model_dump()
    if spec.art_style not in STYLE_SUFFIXES:
        raise HTTPException(400, f"unknown art_style, choose from {list(STYLE_SUFFIXES)}")
    BOOKS[book_id] = {
        "meta": meta,
        "chapters": [{"idx": i, "text": "", "image_prompt": "", "status": "queued", "score": None} for i in range(spec.chapters)],
        "status": "running",
        "ref_b64": None,
        "subscribers": [],
    }
    persist(book_id)
    asyncio.create_task(run_book(book_id))
    return {"id": book_id, "status": "running"}


@router.get("/api/story/{book_id}")
def get_story(book_id: str) -> dict[str, Any]:
    ensure_book(book_id)
    return public_book(book_id)


@router.get("/api/story/{book_id}/events")
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


@router.post("/api/story/{book_id}/regenerate")
async def regenerate(book_id: str, req: Regenerate) -> dict[str, Any]:
    book = ensure_book(book_id)
    if not (0 <= req.chapter_idx < len(book["chapters"])):
        raise HTTPException(400, "chapter_idx out of range")
    ch = book["chapters"][req.chapter_idx]
    if book["status"] == "running" and ch.get("status") != "done":
        raise HTTPException(409, "chapter still generating — wait for it to finish")
    seed = req.seed if req.seed is not None else random.randint(0, 2**31 - 1)
    if not ch.get("image_prompt"):
        raise HTTPException(400, "chapter has no image prompt yet")
    ch["status"] = "drawing"
    emit(book_id, {"type": "chapter", "idx": req.chapter_idx, "status": "drawing"})
    try:
        png, score = await render_scene(book_id, req.chapter_idx, ch["image_prompt"], seed)
        with open(book_dir(book_id) / f"ch{req.chapter_idx}.png", "wb") as f:
            f.write(png)
        ch["score"] = score
        ch["status"] = "done"
    except Exception as e:
        ch["status"] = f"error: {type(e).__name__}: {e}"[:300]
    persist(book_id)
    emit(book_id, {"type": "chapter", "idx": req.chapter_idx, "status": ch["status"]})
    return {"idx": req.chapter_idx, "status": ch["status"]}


@router.get("/api/story/{book_id}/export")
def export_book(book_id: str, format: str = "html"):
    ensure_book(book_id)
    if format == "pdf":
        pdf = render_pdf(book_id)
        slug = re.sub(r"[^a-z0-9]+", "-", public_book(book_id)["meta"]["hero"].lower()).strip("-")
        return Response(
            content=pdf,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{slug or "storybook"}.pdf"'},
        )
    book = public_book(book_id)
    hero = html.escape(book["meta"]["hero"])
    theme = html.escape(book["meta"]["theme"])
    pages = "\n".join(
        f"<section><h2>Chapter {c['idx'] + 1}</h2>"
        + (f"<img src=\"{c['image_url']}\"/>" if c["image_url"] else "<p><em>(image pending)</em></p>")
        + f"<p>{html.escape(c['text']) if c['text'] else '<em>(text pending)</em>'}</p></section>"
        for c in book["chapters"]
    )
    return HTMLResponse(
        "<!doctype html><html><head><meta charset=utf-8>"
        f"<title>{hero} — {theme}</title>"
        "<style>body{font-family:Georgia,serif;max-width:720px;margin:auto;padding:2rem}"
        "img{width:100%;border-radius:8px}section{margin-bottom:3rem}</style>"
        f"</head><body><h1>{hero}</h1><p>{theme}</p>"
        f"{pages}</body></html>"
    )
