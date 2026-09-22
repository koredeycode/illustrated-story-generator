"""HTTP API: health, books, SSE events, regeneration, export."""
from __future__ import annotations

import asyncio
import html
import json
import random
import re
import time
import uuid
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse, Response, StreamingResponse
from pydantic import BaseModel, Field

try:
    from .config import DATA_DIR, FORGE_URL, OLLAMA_URL, QUALITY_PRESETS
    from .pdf_export import render_pdf
    from .prompts import STYLE_SUFFIXES
    from .store import BOOKS, book_dir, emit, ensure_book, persist, public_book
    from .storage import download_book, enabled as storage_enabled, list_remote
    from .story import adopt_reference, generate_cover, preview_scene, render_reference_options, render_scene, run_book, suggest
    from .audiobook import available as audio_available, build_audiobook
    from .templates import list_book_types
    from .templates import BOOK_TYPES as _BT
    from .projects import (append_message, create_project, emit_project, ensure_project,
                           link_version, list_projects, project_dir, public_project, save_plan)
    from .bible import read_bible, write_bible
    from .agent import chat_freeform, chat_planner, detect_intent
except ImportError:
    from config import DATA_DIR, FORGE_URL, OLLAMA_URL, QUALITY_PRESETS
    from pdf_export import render_pdf
    from prompts import STYLE_SUFFIXES
    from store import BOOKS, book_dir, emit, ensure_book, persist, public_book
    from storage import download_book, enabled as storage_enabled, list_remote
    from story import adopt_reference, generate_cover, preview_scene, render_reference_options, render_scene, run_book, suggest
    from audiobook import available as audio_available, build_audiobook
    from templates import list_book_types
    from templates import BOOK_TYPES as _BT  # type: ignore
    from projects import (append_message, create_project, emit_project, ensure_project,
                          link_version, list_projects, project_dir, public_project, save_plan)
    from bible import read_bible, write_bible
    from agent import chat_freeform, chat_planner, detect_intent

router = APIRouter()


class StoryCreate(BaseModel):
    theme: str = Field(min_length=3, max_length=500)
    hero: str = Field(min_length=1, max_length=100)
    hero_desc: str = Field(default="", max_length=300)
    chapters: int = Field(default=5, ge=1, le=10)
    art_style: str = "watercolor"
    book_type: str = "picture"
    seed: int = 42
    quality: str = "balanced"
    dedication: str = Field(default="", max_length=120)
    lora: str = Field(default="", max_length=100)
    approval: bool = False
    ref_token: str = Field(default="", max_length=16)
    ref_seed: int | None = None


class Regenerate(BaseModel):
    chapter_idx: int = Field(ge=0)
    seed: int | None = None


class ReferenceSpec(BaseModel):
    hero_desc: str = Field(min_length=1, max_length=300)
    art_style: str = "watercolor"
    seed: int = 42


class PreviewSpec(BaseModel):
    chapter_idx: int = Field(ge=0)
    seed: int | None = None


class ApproveSpec(BaseModel):
    chapter_idx: int = Field(ge=0)


class CoverSpec(BaseModel):
    layout: str = "banner"


class SuggestSpec(BaseModel):
    kind: str = Field(pattern="^(theme|hero|look|dedication)$")
    context: dict[str, Any] = {}


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
    return {"backend": "ok", "ollama": ollama, "forge": forge,
            "storage": "r2" if storage_enabled() else "local"}


@router.get("/api/styles")
def styles() -> list[str]:
    return list(STYLE_SUFFIXES)


@router.post("/api/reference")
async def make_reference(spec: ReferenceSpec) -> dict[str, Any]:
    """Render 3 hero portraits for the user to pick from."""
    if spec.art_style not in STYLE_SUFFIXES:
        raise HTTPException(400, f"unknown art_style, choose from {list(STYLE_SUFFIXES)}")
    try:
        token, options = await asyncio.to_thread(
            render_reference_options, spec.hero_desc, spec.art_style, spec.seed
        )
    except Exception as e:
        raise HTTPException(502, f"reference render failed: {type(e).__name__}: {e}")
    return {"token": token, "options": options}


@router.post("/api/story", status_code=201)
async def create_story(spec: StoryCreate) -> dict[str, Any]:
    book_id = uuid.uuid4().hex[:8]
    meta = spec.model_dump()
    if spec.art_style not in STYLE_SUFFIXES:
        raise HTTPException(400, f"unknown art_style, choose from {list(STYLE_SUFFIXES)}")
    if spec.quality not in QUALITY_PRESETS:
        raise HTTPException(400, f"unknown quality, choose from {list(QUALITY_PRESETS)}")
    if spec.book_type not in _BT:
        raise HTTPException(400, f"unknown book_type, choose from {sorted(_BT)}")
    BOOKS[book_id] = {
        "meta": meta,
        "chapters": [{"idx": i, "text": "", "image_prompt": "", "status": "queued", "score": None} for i in range(spec.chapters)],
        "status": "running",
        "ref_b64": None,
        "remote": None,
        "audio": {"status": "idle"},
        "subscribers": [],
    }
    persist(book_id)
    asyncio.create_task(run_book(book_id))
    return {"id": book_id, "status": "running"}


@router.post("/api/suggest")
async def suggest_ideas(spec: SuggestSpec) -> dict[str, Any]:
    """LLM-generated wizard suggestions (themes, names, looks, dedications)."""
    try:
        items = await asyncio.to_thread(suggest, spec.kind, spec.context)
    except Exception as e:
        raise HTTPException(502, f"suggest failed: {type(e).__name__}: {e}")
    return {"suggestions": items}


@router.get("/api/books")
def list_books() -> dict[str, Any]:
    """Library: local books merged with remote (R2) ones, with title metadata."""
    local = {d.name for d in DATA_DIR.iterdir() if (d / "book.json").exists()} if DATA_DIR.exists() else set()
    remote = set(list_remote())

    def _meta(book_id: str) -> dict[str, Any] | None:
        try:
            saved = json.loads((DATA_DIR / book_id / "book.json").read_text())
            m = saved.get("meta", {})
            return {"hero": m.get("hero", book_id), "theme": m.get("theme", ""),
                    "chapters": len(saved.get("chapters", []))}
        except Exception:
            return None

    items = [{"id": i, "local": i in local, "remote": i in remote,
              "meta": _meta(i) if i in local else None}
             for i in sorted(local | remote)]
    return {"books": items, "storage": "r2" if storage_enabled() else "local"}


@router.post("/api/books/{book_id}/fetch")
def fetch_book(book_id: str) -> dict[str, Any]:
    """Download a remote-only book into local disk, then serve it."""
    if ((DATA_DIR / book_id) / "book.json").exists():
        ensure_book(book_id)
        return {"id": book_id, "status": "cached"}
    if download_book(book_id):
        ensure_book(book_id)
        return {"id": book_id, "status": "downloaded"}
    raise HTTPException(404, "book not found locally or remotely")


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


@router.get("/api/loras")
def list_loras() -> dict[str, Any]:
    """LoRAs available in Forge (for the style picker). [] when unreachable."""
    try:
        r = httpx.get(f"{FORGE_URL}/sdapi/v1/loras", timeout=15)
        names = [l.get("name") for l in r.json() if l.get("name")] if r.status_code == 200 else []
    except Exception:
        names = []
    return {"loras": names}


@router.post("/api/story/{book_id}/preview")
async def preview(book_id: str, req: PreviewSpec) -> dict[str, Any]:
    """(Re-)render a fast preview for approval-mode chapters."""
    book = ensure_book(book_id)
    if not (0 <= req.chapter_idx < len(book["chapters"])):
        raise HTTPException(400, "chapter_idx out of range")
    ch = book["chapters"][req.chapter_idx]
    if not ch.get("image_prompt"):
        raise HTTPException(400, "chapter has no image prompt yet")
    seed = req.seed if req.seed is not None else random.randint(0, 2**31 - 1)
    try:
        png = await preview_scene(book_id, req.chapter_idx, ch["image_prompt"], seed)
        with open(book_dir(book_id) / f"pv{req.chapter_idx}.png", "wb") as f:
            f.write(png)
        ch["status"] = "preview"
    except Exception as e:
        ch["status"] = f"error: {type(e).__name__}: {e}"[:300]
    persist(book_id)
    emit(book_id, {"type": "chapter", "idx": req.chapter_idx, "status": ch["status"]})
    return {"idx": req.chapter_idx, "status": ch["status"]}


@router.post("/api/story/{book_id}/approve")
async def approve(book_id: str, req: ApproveSpec) -> dict[str, Any]:
    """Approve a preview: full gated render, then release the waiting book."""
    book = ensure_book(book_id)
    if not (0 <= req.chapter_idx < len(book["chapters"])):
        raise HTTPException(400, "chapter_idx out of range")
    ch = book["chapters"][req.chapter_idx]
    if not ch.get("image_prompt"):
        raise HTTPException(400, "chapter has no image prompt yet")
    ch["status"] = "drawing"
    emit(book_id, {"type": "chapter", "idx": req.chapter_idx, "status": "drawing"})
    try:
        t1 = time.perf_counter()
        png, score = await render_scene(
            book_id, req.chapter_idx, ch["image_prompt"], random.randint(0, 2**31 - 1))
        ch.setdefault("timings", {})["drawing_s"] = round(time.perf_counter() - t1, 1)
        with open(book_dir(book_id) / f"ch{req.chapter_idx}.png", "wb") as f:
            f.write(png)
        ch["score"] = score
        ch["status"] = "done"
    except Exception as e:
        ch["status"] = f"error: {type(e).__name__}: {e}"[:300]
    persist(book_id)
    emit(book_id, {"type": "chapter", "idx": req.chapter_idx, "status": ch["status"]})
    ev = book.get("approvals", {}).pop(req.chapter_idx, None)
    if ev is not None:
        ev.set()
    return {"idx": req.chapter_idx, "status": ch["status"]}


@router.post("/api/story/{book_id}/audiobook")
async def start_audiobook(book_id: str) -> dict[str, Any]:
    """Kick off MP4 audiobook rendering (background job, progress via SSE)."""
    book = ensure_book(book_id)
    if book.get("audio", {}).get("status") == "working":
        raise HTTPException(409, "audiobook already rendering")
    ok, why = await asyncio.to_thread(audio_available)
    if not ok:
        raise HTTPException(500, f"audiobook unavailable: {why}")
    book["audio"] = {"status": "working", "progress": 0}
    asyncio.create_task(build_audiobook(book_id))
    return {"status": "working"}


@router.get("/api/story/{book_id}/audiobook")
def audiobook_status(book_id: str) -> dict[str, Any]:
    book = ensure_book(book_id)
    return dict(book.get("audio", {"status": "idle"}))


@router.post("/api/story/{book_id}/cover")
async def make_cover(book_id: str, req: CoverSpec) -> dict[str, Any]:
    """(Re-)generate the cover from the best chapter image."""
    ensure_book(book_id)
    try:
        url = await generate_cover(book_id, req.layout)
    except Exception as e:
        import traceback

        traceback.print_exc()
        raise HTTPException(502, f"cover failed: {type(e).__name__}: {e}")
    if not url:
        raise HTTPException(400, "no finished chapter image to build a cover from")
    emit(book_id, {"type": "cover", "status": "done"})
    return {"cover_url": url}


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
    dedication = (book["meta"].get("dedication") or "").strip()
    head = f"<h1>{hero}</h1><p>{theme}</p>"
    if book.get("cover_url"):
        head = f"<img src=\"{book['cover_url']}\"/>" + head
    if dedication:
        head += f"<blockquote>{html.escape(dedication)}</blockquote>"
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
        f"</head><body>{head}"
        f"{pages}</body></html>"
    )


# ---------------- Stitch-style projects + agent chat (M1/M6) ----------------

class ProjectCreate(BaseModel):
    title: str = ""
    book_type: str = "picture"


class ChatSpec(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    chapter_idx: int | None = Field(default=None, ge=0)
    context: dict[str, Any] = {}


class PlanApprove(BaseModel):
    plan: dict[str, Any] | None = None


class BibleSave(BaseModel):
    bible: str = Field(max_length=20000)


@router.get("/api/book-types")
def book_types() -> dict[str, Any]:
    return {"types": list_book_types()}


@router.post("/api/projects", status_code=201)
def api_create_project(spec: ProjectCreate) -> dict[str, Any]:
    pid = create_project(spec.title, spec.book_type)
    return {"id": pid}


@router.get("/api/projects")
def api_list_projects() -> dict[str, Any]:
    return {"projects": list_projects(),
            "storage": "r2" if storage_enabled() else "local"}


@router.get("/api/projects/{pid}")
def api_get_project(pid: str) -> dict[str, Any]:
    return public_project(pid)


@router.get("/api/projects/{pid}/bible")
def api_get_bible(pid: str) -> dict[str, Any]:
    ensure_project(pid)
    return {"bible": read_bible(project_dir(pid))}


@router.put("/api/projects/{pid}/bible")
def api_save_bible(pid: str, spec: BibleSave) -> dict[str, Any]:
    ensure_project(pid)
    write_bible(project_dir(pid), spec.bible)
    append_message(pid, "user", "(edited BOOK.md in the Inspector)")
    append_message(pid, "assistant", "Bible updated — I'll use the new locks from here on.")
    emit_project(pid, {"type": "bible", "status": "saved"})
    try:
        from .storage import sync_project as _sync_p
    except ImportError:
        from storage import sync_project as _sync_p  # type: ignore
    try:
        _sync_p(pid)
    except Exception:
        pass
    return {"status": "saved"}


@router.post("/api/projects/{pid}/chat")
async def api_project_chat(pid: str, spec: ChatSpec) -> dict[str, Any]:
    """Supervised agent turn: plan / rewrite / redraw / free chat."""
    p = ensure_project(pid)
    history = list(p.get("messages", []))
    bible_md = read_bible(project_dir(pid))
    append_message(pid, "user", spec.message,
                   {"selection": spec.chapter_idx} if spec.chapter_idx is not None else None)
    emit_project(pid, {"type": "message", "role": "user", "content": spec.message})
    emit_project(pid, {"type": "agent_thinking", "status": "working"})
    intent = detect_intent(spec.message,
                           has_plan=bool(bible_md or p.get("pending_plan")))
    try:
        if intent == "plan":
            ctx = {**(p.get("pending_plan") or {}), **(spec.context or {}),
                   "book_type": p["meta"].get("book_type", "picture")}
            plan = await asyncio.to_thread(chat_planner, spec.message, ctx)
            if plan.get("book_type") not in _BT:
                plan["book_type"] = p["meta"].get("book_type", "picture")
            p["meta"]["book_type"] = plan.get("book_type", p["meta"].get("book_type", "picture"))
            save_plan(pid, plan)
            reply = (f"Here's my plan for **{plan.get('title', 'your book')}** "
                     f"({plan.get('chapters')} chapters, {plan.get('book_type')}). "
                     "Review the card and hit Approve to start generation — or tell me what to change.")
            append_message(pid, "assistant", reply, {"plan": plan, "kind": "plan"})
            emit_project(pid, {"type": "approval_request", "kind": "plan", "plan": plan})
            emit_project(pid, {"type": "message", "role": "assistant", "content": reply})
            return {"reply": reply, "intent": intent, "plan": plan}
        if intent == "redraw" and p.get("active_book"):
            book_id = p["active_book"]
            book = ensure_book(book_id)
            n = len(book["chapters"])
            if spec.chapter_idx is None:
                reply = "Which page should I redraw? Click a page in the Storyboard tab first, then ask again."
            elif spec.chapter_idx >= n:
                reply = f"Page {spec.chapter_idx + 1} doesn't exist — this book has {n} pages."
            elif book["status"] == "running" and book["chapters"][spec.chapter_idx].get("status") != "done":
                reply = (f"Page {spec.chapter_idx + 1} is still generating — "
                         "wait for it to finish, then I'll redraw it.")
            else:
                idx = spec.chapter_idx
                ch = book["chapters"][idx]
                if not ch.get("image_prompt"):
                    reply = "That page has no image prompt yet — let the writer finish first."
                else:
                    ch["status"] = "drawing"
                    emit(book_id, {"type": "chapter", "idx": idx, "status": "drawing"})
                    try:
                        png, score = await render_scene(book_id, idx, ch["image_prompt"],
                                                        random.randint(0, 2**31 - 1))
                        with open(book_dir(book_id) / f"ch{idx}.png", "wb") as f:
                            f.write(png)
                        ch["score"] = score
                        ch["status"] = "done"
                        reply = f"Redrew page {idx + 1} with a fresh seed."
                    except Exception as e:
                        ch["status"] = f"error: {type(e).__name__}: {e}"[:200]
                        reply = f"Redraw failed: {ch['status']}"
                    persist(book_id)
                    emit(book_id, {"type": "chapter", "idx": idx, "status": ch["status"]})
                    emit_project(pid, {"type": "canvas", "book": public_book(book_id)})
            append_message(pid, "assistant", reply, {"kind": "redraw"})
            emit_project(pid, {"type": "message", "role": "assistant", "content": reply})
            return {"reply": reply, "intent": intent}
        if intent == "rewrite" and p.get("active_book"):
            reply = ("I'll rewrite via a fresh chapter pass on the next run — "
                     "for now, tell me which page and the new direction "
                     "(e.g. 'page 2, funnier, half the length').")
            append_message(pid, "assistant", reply, {"kind": "rewrite"})
            emit_project(pid, {"type": "message", "role": "assistant", "content": reply})
            return {"reply": reply, "intent": intent}
        reply = await asyncio.to_thread(chat_freeform, spec.message, bible_md, history)
        append_message(pid, "assistant", reply, {"kind": "chat"})
        emit_project(pid, {"type": "message", "role": "assistant", "content": reply})
        return {"reply": reply, "intent": "chat"}
    except Exception as e:
        reply = f"Sorry — that turn failed ({type(e).__name__}: {str(e)[:160]}). Try again?"
        append_message(pid, "assistant", reply, {"kind": "error"})
        emit_project(pid, {"type": "message", "role": "assistant", "content": reply})
        return {"reply": reply, "intent": "error"}
    finally:
        try:
            from .projects import _persist_project as _pp
        except ImportError:
            from projects import _persist_project as _pp  # type: ignore
        try:
            _pp(pid)
        except Exception:
            pass


@router.post("/api/projects/{pid}/plan/approve")
async def api_approve_plan(pid: str, spec: PlanApprove) -> dict[str, Any]:
    """Approve pending plan -> create classic book, link version, run pipeline."""
    p = ensure_project(pid)
    plan = (spec.plan or p.get("pending_plan") or {})
    if not plan.get("theme") or not plan.get("hero"):
        raise HTTPException(400, "no plan to approve — chat a book idea first")

    def _coerce_int(value: Any, default: int, lo: int, hi: int) -> int:
        try:
            return max(lo, min(hi, int(value)))
        except (TypeError, ValueError):
            return default

    book_id = uuid.uuid4().hex[:8]
    chapters_n = _coerce_int(plan.get("chapters", 5), 5, 1, 10)
    art_style = str(plan.get("art_style", "watercolor"))
    if art_style not in STYLE_SUFFIXES:
        art_style = "watercolor"
    book_type = str(plan.get("book_type", p["meta"].get("book_type", "picture")))
    if book_type not in _BT:
        book_type = "picture"
    quality = str(plan.get("quality", "balanced"))
    if quality not in QUALITY_PRESETS:
        quality = "balanced"
    meta = {"theme": str(plan.get("theme", ""))[:500],
            "hero": str(plan.get("hero", "Hero"))[:100],
            "hero_desc": str(plan.get("hero_desc", ""))[:300],
            "chapters": chapters_n,
            "art_style": art_style,
            "book_type": book_type,
            "seed": _coerce_int(plan.get("seed", 42), 42, 0, 2**31 - 1),
            "quality": quality,
            "dedication": str(plan.get("dedication", ""))[:120],
            "lora": str(plan.get("lora", ""))[:100],
            "approval": False, "ref_token": "", "ref_seed": None}
    BOOKS[book_id] = {
        "meta": meta,
        "chapters": [{"idx": i, "text": "", "image_prompt": "", "status": "queued", "score": None}
                     for i in range(meta["chapters"])],
        "status": "running", "ref_b64": None, "remote": None,
        "audio": {"status": "idle"}, "subscribers": [],
    }
    persist(book_id)
    v = link_version(pid, book_id, label=str(plan.get("title") or meta["hero"]))
    p["pending_plan"] = None
    append_message(pid, "assistant",
                   f"Approved — generating **{meta['hero']}** ({meta['chapters']} pages). Watch the canvas fill in.",
                   {"kind": "approved", "book_id": book_id})
    emit_project(pid, {"type": "message", "role": "assistant",
                       "content": "Generation started."})

    async def _run_and_close() -> None:
        try:
            from .story import run_book as _run
        except ImportError:
            from story import run_book as _run  # type: ignore

        async def _monitor() -> None:
            """Forward per-chapter progress snapshots until the book completes."""
            last: list | None = None
            while True:
                await asyncio.sleep(3)
                book = BOOKS.get(book_id)
                if book is None:
                    return
                sig = [c.get("status") for c in book["chapters"]]
                if sig != last:
                    last = sig
                    try:
                        emit_project(pid, {"type": "canvas", "book": public_book(book_id)})
                    except Exception:
                        pass
                if book.get("status") == "complete":
                    return

        monitor = asyncio.create_task(_monitor())
        try:
            await _run(book_id)
        finally:
            try:
                await asyncio.wait_for(monitor, timeout=10)
            except Exception:
                monitor.cancel()
        try:
            from .storage import sync_book as _sync_b
        except ImportError:
            from storage import sync_book as _sync_b  # type: ignore
        await asyncio.to_thread(_sync_b, book_id)
        try:
            emit_project(pid, {"type": "canvas", "book": public_book(book_id)})
            emit_project(pid, {"type": "book", "status": "complete", "book_id": book_id})
        except Exception:
            pass
    asyncio.create_task(_run_and_close())
    return {"book_id": book_id, "version": v}


@router.get("/api/projects/{pid}/events")
async def project_events(pid: str) -> StreamingResponse:
    p = ensure_project(pid)
    queue: asyncio.Queue = asyncio.Queue()
    p["subscribers"].append(queue)

    async def gen():
        try:
            yield f"data: {json.dumps({'type': 'snapshot', 'project': public_project(pid)})}\n\n"
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=25)
                    yield f"data: {json.dumps(event)}\n\n"
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        finally:
            try:
                p["subscribers"].remove(queue)
            except ValueError:
                pass

    return StreamingResponse(gen(), media_type="text/event-stream")
