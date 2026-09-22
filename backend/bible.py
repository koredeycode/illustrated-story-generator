"""BOOK.md — the portable book bible (our answer to Stitch's DESIGN.md).

One markdown file per project that locks premise, cast, world rules,
style, and chapter beats. The agent reads it on every turn; users can
edit it in the Inspector; it syncs to R2 with the project so a book can
move machines and keep its identity.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

BIBLE_NAME = "BOOK.md"


def bible_path(project_dir: Path) -> Path:
    return project_dir / BIBLE_NAME


def read_bible(project_dir: Path) -> str:
    p = bible_path(project_dir)
    return p.read_text(encoding="utf-8") if p.exists() else ""


def write_bible(project_dir: Path, md: str) -> None:
    project_dir.mkdir(parents=True, exist_ok=True)
    bible_path(project_dir).write_text(md or "", encoding="utf-8")


def build_bible_md(plan: dict[str, Any]) -> str:
    """Render a plan dict into a BOOK.md document."""
    beats = plan.get("beats") or []
    beats_md = "\n".join(f"{i + 1}. {b}" for i, b in enumerate(beats)) or "_TBD_"
    return (
        f"# {plan.get('title') or plan.get('hero') or 'Untitled Book'}\n\n"
        f"- Type: {plan.get('book_type', 'picture')}\n"
        f"- Premise: {plan.get('theme', '')}\n"
        f"- Hero: {plan.get('hero', '')}\n"
        f"- Look: {plan.get('hero_desc', '')}\n"
        f"- Art style: {plan.get('art_style', 'watercolor')}"
        f"{(' + ' + plan['lora']) if plan.get('lora') else ''}\n"
        f"- Chapters: {plan.get('chapters', 5)}\n"
        f"- Seed: {plan.get('seed', 42)}\n"
        f"{('- Dedication: ' + plan['dedication']) if plan.get('dedication') else ''}\n"
        f"\n## World rules\n{plan.get('world_rules') or '- Keep continuity across chapters.'}\n"
        f"\n## Style lock\n{plan.get('style_lock') or 'Same character design and palette on every page.'}\n"
        f"\n## Beats\n{beats_md}\n"
    )


def parse_bible(md: str) -> dict[str, Any]:
    """Best-effort parse of BOOK.md back into a plan-ish dict (for prompts)."""
    out: dict[str, Any] = {"raw": md or ""}
    try:
        import re as _re

        def field(name: str) -> str:
            m = _re.search(rf"^-\s*{name}:\s*(.+)$", md or "", _re.M | _re.I)
            return m.group(1).strip() if m else ""

        out.update({
            "book_type": field("Type") or "picture",
            "theme": field("Premise"),
            "hero": field("Hero"),
            "hero_desc": field("Look"),
            "art_style": (field("Art style") or "watercolor").split("+")[0].strip(),
        })
        m = _re.search(r"## Beats\n(.+)", md or "", _re.S)
        if m:
            out["beats"] = [l.strip(" .") for l in m.group(1).splitlines()
                            if l.strip() and not l.strip().startswith("_")]
    except Exception:
        pass
    return out
