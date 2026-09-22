"""MP4 audiobook export: chapter narration (edge-tts) over slideshows (ffmpeg).

Optional: availability is probed at call time; missing edge-tts/ffmpeg
yields a clear error instead of a broken file. Narration mp3s are cached
per text-hash so re-exports are free.
"""
from __future__ import annotations

import asyncio
import hashlib
import shutil
import subprocess
from pathlib import Path
from typing import Any

try:
    from .store import BOOKS, book_dir, emit, persist
except ImportError:
    from store import BOOKS, book_dir, emit, persist

VOICE = __import__("os").environ.get("AUDIOBOOK_VOICE", "en-US-AriaNeural")


def available() -> tuple[bool, str]:
    try:
        import edge_tts  # noqa: F401
    except ImportError:
        return False, "pip install edge-tts"
    if shutil.which("ffmpeg") is None:
        return False, "ffmpeg not found (apt install ffmpeg)"
    return True, "ok"


def _run(cmd: list[str]) -> None:
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError((p.stderr or p.stdout)[-500:])


async def _narrate(text: str, out: Path) -> None:
    import edge_tts

    await edge_tts.Communicate(text, VOICE).save(str(out))


def _segment(image: Path, audio: Path, out: Path) -> None:
    _run(["ffmpeg", "-y", "-v", "error", "-loop", "1", "-i", str(image),
          "-i", str(audio), "-c:v", "libx264", "-pix_fmt", "yuv420p",
          "-c:a", "aac", "-shortest", str(out)])


def _duration(path: Path) -> float:
    p = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(path)],
        capture_output=True, text=True,
    )
    if p.returncode != 0:
        raise RuntimeError((p.stderr or p.stdout)[-300:])
    return float(p.stdout.strip())


def _stamp(seconds: float) -> str:
    ms = int(round(seconds * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"


def _write_vtt(cues: list[tuple[float, float, str]], out: Path) -> None:
    lines = ["WEBVTT", ""]
    for start, end, text in cues:
        lines += [f"{_stamp(start)} --> {_stamp(end)}", text, ""]
    out.write_text("\n".join(lines), encoding="utf-8")


def _concat(parts: list[Path], out: Path, workdir: Path) -> None:
    lst = workdir / "parts.txt"
    lst.write_text("".join(f"file '{p.name}'\n" for p in parts))
    _run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0",
          "-i", str(lst), "-c", "copy", str(out)])


async def build_audiobook(book_id: str) -> None:
    """Background job: narrate chapters with text, stitch into audiobook.mp4."""
    book = BOOKS[book_id]
    book["audio"] = {"status": "working", "progress": 0}
    emit(book_id, {"type": "audiobook", "status": "working", "progress": 0})
    try:
        ok, why = await asyncio.to_thread(available)
        if not ok:
            raise RuntimeError(f"audiobook unavailable: {why}")
        d = book_dir(book_id)
        work = d / "audio_work"
        work.mkdir(exist_ok=True)
        voiced = [(c["idx"], c["text"]) for c in book["chapters"] if (c.get("text") or "").strip()]
        if not voiced:
            raise RuntimeError("no chapter text to narrate")
        segments = []
        cue_src: list[tuple[int, str, Path]] = []
        for n, (idx, text) in enumerate(voiced):
            img = d / f"ch{idx}.png"
            if not img.exists():
                continue
            digest = hashlib.sha256(f"{VOICE}:{text}".encode()).hexdigest()[:16]
            mp3 = work / f"ch{idx}-{digest}.mp3"
            if not mp3.exists():
                await _narrate(text, mp3)
            seg = work / f"seg{idx}.mp4"
            await asyncio.to_thread(_segment, img, mp3, seg)
            segments.append(seg)
            cue_src.append((idx, text, seg))
            progress = round((n + 1) / len(voiced) * 100)
            book["audio"] = {"status": "working", "progress": progress}
            emit(book_id, {"type": "audiobook", "status": "working", "progress": progress})
        if not segments:
            raise RuntimeError("no illustrated chapters to stitch")
        await asyncio.to_thread(_concat, segments, d / "audiobook.mp4", work)
        cues = []
        cursor = 0.0
        for idx, text, seg in cue_src:
            dur = await asyncio.to_thread(_duration, seg)
            snippet = " ".join(text.split())[:140]
            cues.append((cursor, cursor + dur, f"Chapter {idx + 1}\n{snippet}"))
            cursor += dur
        await asyncio.to_thread(_write_vtt, cues, d / "audiobook.vtt")
        book["audio"] = {"status": "done", "url": f"/books/{book_id}/audiobook.mp4",
                         "captions": f"/books/{book_id}/audiobook.vtt"}
        emit(book_id, {"type": "audiobook", "status": "done"})
    except Exception as e:
        book["audio"] = {"status": f"error: {type(e).__name__}: {str(e)[:200]}"}
        emit(book_id, {"type": "audiobook", "status": book["audio"]["status"]})
    persist(book_id)
