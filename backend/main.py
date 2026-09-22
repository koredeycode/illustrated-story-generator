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

from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

try:
    from .config import DATA_DIR
    from .routes import router
except ImportError:
    from config import DATA_DIR
    from routes import router

app = FastAPI(title="Illustrated Story Generator")
app.include_router(router)

# ---------- static (frontend build + book images). Registered last. ----------

app.mount("/books", StaticFiles(directory=str(DATA_DIR)), name="books")

DIST = Path(__file__).parent.parent / "frontend" / "dist"
if DIST.exists():
    app.mount("/", StaticFiles(directory=str(DIST), html=True), name="frontend")
else:

    @app.get("/")
    def no_frontend() -> dict[str, str]:
        return {"message": "backend ok — frontend/dist not built yet"}
