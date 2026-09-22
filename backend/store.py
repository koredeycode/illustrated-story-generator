"""In-memory book registry with lazy disk reload."""
from __future__ import annotations

import base64
import json
from pathlib import Path
from typing import Any

from fastapi import HTTPException

try:
    from .config import DATA_DIR
except ImportError:
    from config import DATA_DIR

# book_id -> {"meta": dict, "chapters": [dict], "status": str,
#             "ref_b64": str | None, "subscribers": [asyncio.Queue]}
BOOKS: dict[str, dict[str, Any]] = {}


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
            "remote": None,
            "audio": {"status": "idle"},
            "subscribers": [],
        }
        ref_path = DATA_DIR / book_id / "hero_ref.png"
        book["ref_b64"] = (
            base64.b64encode(ref_path.read_bytes()).decode() if ref_path.exists() else None
        )
        BOOKS[book_id] = book
    return book


def match_label(score: float | None) -> str | None:
    """Human-readable CLIP band. Raw cosine tops out ~0.35, so grade on that curve."""
    if score is None:
        return None
    if score >= 0.30:
        return "strong"
    if score >= 0.24:
        return "good"
    return "weak"


def public_book(book_id: str) -> dict[str, Any]:
    book = BOOKS[book_id]
    d = book_dir(book_id)
    chapters = [
        {**c,
         "image_url": f"/books/{book_id}/ch{c['idx']}.png" if (d / f"ch{c['idx']}.png").exists() else None,
         "preview_url": f"/books/{book_id}/pv{c['idx']}.png" if (d / f"pv{c['idx']}.png").exists() else None,
         "match": match_label(c.get("score"))}
        for c in book["chapters"]
    ]
    return {"id": book_id, "meta": book["meta"], "status": book["status"], "chapters": chapters,
            "audio": book.get("audio", {"status": "idle"}),
            "cover_url": f"/books/{book_id}/cover.png" if (d / "cover.png").exists() else None}
