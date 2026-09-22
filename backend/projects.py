"""Projects: Stitch-style workspace over the existing book pipeline.

A project owns BOOK.md + chat history + a version timeline where each
version points at a classic book_id dir (book.json + ch*.png). All heavy
rendering still reuses story.py/run_book untouched.
"""
from __future__ import annotations

import asyncio
import json
import time
import uuid
from pathlib import Path
from typing import Any

try:
    from .bible import build_bible_md, read_bible, write_bible
    from .config import DATA_DIR
    from .store import ensure_book, public_book
except ImportError:
    from bible import build_bible_md, read_bible, write_bible
    from config import DATA_DIR
    from store import ensure_book, public_book

PROJECTS: dict[str, dict[str, Any]] = {}
PROJ_ROOT = DATA_DIR / "_projects"

_PID_RE = __import__("re").compile(r"[A-Za-z0-9_-]{1,32}")


def _check_pid(pid: str) -> None:
    """Reject path traversal / odd ids before they touch the filesystem."""
    from fastapi import HTTPException
    if not _PID_RE.fullmatch(pid or ""):
        raise HTTPException(404, "unknown project")


def project_dir(pid: str) -> Path:
    _check_pid(pid)
    d = PROJ_ROOT / pid
    d.mkdir(parents=True, exist_ok=True)
    return d


def _persist_project(pid: str) -> None:
    p = PROJECTS[pid]
    d = project_dir(pid)
    (d / "project.json").write_text(json.dumps({
        "meta": p["meta"], "versions": p["versions"],
        "active_book": p.get("active_book"), "pending_plan": p.get("pending_plan"),
        "updated": time.strftime("%Y-%m-%dT%H:%M:%S"),
    }, indent=2))


def _load_messages(pid: str) -> list[dict]:
    f = project_dir(pid) / "messages.jsonl"
    if not f.exists():
        return []
    out = []
    for line in f.read_text().splitlines():
        try:
            out.append(json.loads(line))
        except ValueError:
            continue
    return out[-200:]


def append_message(pid: str, role: str, content: str, extra: dict | None = None) -> dict:
    msg = {"role": role, "content": content, "ts": time.strftime("%H:%M:%S")}
    if extra:
        msg.update(extra)
    with open(project_dir(pid) / "messages.jsonl", "a") as f:
        f.write(json.dumps(msg) + "\n")
    p = PROJECTS.get(pid)
    if p is not None:
        p.setdefault("messages", []).append(msg)
        p["messages"] = p["messages"][-200:]
    return msg


def create_project(title: str = "", book_type: str = "picture") -> str:
    pid = uuid.uuid4().hex[:8]
    PROJECTS[pid] = {"meta": {"title": title or "Untitled project",
                              "book_type": book_type or "picture",
                              "created": time.strftime("%Y-%m-%dT%H:%M:%S")},
                     "versions": [], "active_book": None,
                     "pending_plan": None, "messages": [],
                     "subscribers": []}
    project_dir(pid)
    append_message(pid, "assistant",
                   "Welcome to the Studio. Tell me what book to make — genre, hero, length — and I'll draft a plan card.")
    _persist_project(pid)
    return pid


def ensure_project(pid: str) -> dict[str, Any]:
    _check_pid(pid)
    p = PROJECTS.get(pid)
    if p is not None:
        return p
    d = PROJ_ROOT / pid
    if not (d / "project.json").exists():
        from fastapi import HTTPException
        raise HTTPException(404, "unknown project")
    saved = json.loads((d / "project.json").read_text())
    p = {"meta": saved.get("meta", {}), "versions": saved.get("versions", []),
         "active_book": saved.get("active_book"), "pending_plan": saved.get("pending_plan"),
         "messages": _load_messages(pid), "subscribers": []}
    PROJECTS[pid] = p
    return p


def list_projects() -> list[dict]:
    ids = set(PROJECTS)
    if PROJ_ROOT.exists():
        ids |= {d.name for d in PROJ_ROOT.iterdir()
                if (d / "project.json").exists()}
    out = []
    for pid in sorted(ids):
        try:
            p = ensure_project(pid)
            out.append({"id": pid, "title": p["meta"].get("title", pid),
                        "book_type": p["meta"].get("book_type", "picture"),
                        "versions": len(p["versions"]),
                        "version_books": [v.get("book_id") for v in p["versions"]],
                        "active_book": p.get("active_book")})
        except Exception:
            continue
    return out


def emit_project(pid: str, event: dict[str, Any]) -> None:
    p = PROJECTS.get(pid)
    if p:
        for q in p.get("subscribers", []):
            try:
                q.put_nowait(event)
            except Exception:
                pass


def public_project(pid: str) -> dict[str, Any]:
    p = ensure_project(pid)
    d = project_dir(pid)
    active = None
    if p.get("active_book"):
        try:
            # Lazy disk reload: BOOKS is empty after a backend restart.
            ensure_book(p["active_book"])
            active = public_book(p["active_book"])
        except Exception:
            active = {"id": p["active_book"], "status": "missing", "chapters": []}
    return {"id": pid, "meta": p["meta"], "versions": p["versions"],
            "active_book": p.get("active_book"), "active": active,
            "pending_plan": p.get("pending_plan"),
            "bible": read_bible(d), "messages": p.get("messages", [])[-100:]}


def link_version(pid: str, book_id: str, label: str = "") -> dict:
    p = ensure_project(pid)
    v = {"n": len(p["versions"]) + 1, "book_id": book_id,
         "label": label or f"v{len(p['versions']) + 1}",
         "ts": time.strftime("%Y-%m-%dT%H:%M:%S")}
    p["versions"].append(v)
    p["active_book"] = book_id
    try:
        saved = ensure_book(book_id)
        title = saved["meta"].get("hero") or saved["meta"].get("title") or book_id
        if p["meta"].get("title", "").startswith("Untitled"):
            p["meta"]["title"] = str(title)
    except Exception:
        pass
    _persist_project(pid)
    emit_project(pid, {"type": "version", "version": v})
    return v


def save_plan(pid: str, plan: dict[str, Any]) -> None:
    """Adopt a plan: write BOOK.md + stash as pending until approved."""
    p = ensure_project(pid)
    p["pending_plan"] = plan
    write_bible(project_dir(pid), build_bible_md(plan))
    _persist_project(pid)
    emit_project(pid, {"type": "plan", "plan": plan})
