# Illustrated Story Generator — Build Plan

## What it is
A web app that turns a kid's idea ("a robot who is afraid of the dark") into a fully
illustrated storybook: the LLM writes each chapter and the image model draws each scene.
Runs 100% on free Kaggle GPU; you open it from anywhere via one public URL.

## Architecture (single tunnel)

All three services run on the same Kaggle VM. Only the backend is tunneled — the
frontend is served as static files by the backend, and the backend talks to Ollama and
Forge over `localhost` (no tunnel needed internally, no CORS issues, one public URL).

```
Browser ──https──▶ cloudflared ──▶ FastAPI :8000 ─┬─▶ serves React build (/)
                                                   ├─▶ /api/* ─▶ Ollama :11434 (localhost)
                                                   └─▶ /api/* ─▶ Forge :7860 (localhost)

Kaggle VM: [Ollama :11434] [Forge :7860] [backend :8000 + React dist] [cloudflared]
PC:        browser only. Nothing installed.
```

### Why this shape
- One tunnel = one URL, survives as a single bookmark per session.
- Same-origin frontend→backend: no CORS config, no exposed API keys.
- localhost backend→models: zero tunnel latency on the hot path (10+ image calls).
- Ephemeral-safe: story state lives in `/kaggle/working/books/*.json` + PNGs; re-download
  after session, or push finished books to a GitHub repo from a cell.

## Components

### 1. Backend — FastAPI (`backend/main.py`)
Runs on `:8000`, serves `GET /` from `frontend/dist`, JSON API under `/api`.

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/story` | POST | Create book: `{theme, hero, chapters, art_style}` → returns `book_id`, kicks off generation job |
| `/api/story/{id}` | GET | Book state: chapters with text, image URLs, status per scene |
| `/api/story/{id}/events` | SSE | Progress stream (chapter done, image done) so UI updates live |
| `/api/story/{id}/regenerate` | POST | Re-roll one scene: `{chapter_idx, new_seed?}` |
| `/api/story/{id}/export` | GET | Returns printable HTML (or PDF) of the finished book |

Generation job (background task per book):
1. For each chapter `i`: POST Ollama `/v1/chat/completions` with a system prompt
   demanding strict JSON: `{"text": "...", "image_prompt": "..."}`.
2. Parse; on JSON failure retry once with "return JSON only, no markdown fences".
3. POST Forge `/sdapi/v1/txt2img` with `prompt = image_prompt + HERO_DESC + STYLE_SUFFIX`,
   fixed `seed` per book, `steps: 25–30`, `size: 768x512` (landscape suits books).
4. Save `ch{i}.png` + update `book.json`; emit SSE event.
5. Mark book `complete`.

`HERO_DESC` + `STYLE_SUFFIX` are locked at book creation (e.g. "small robot with round
orange head" + "children's picture-book illustration, warm watercolor") and appended to
every scene prompt — this is the character-consistency mechanism. V1 needs nothing fancier.

### 2. Frontend — React + Vite + Tailwind (`frontend/`)
Pages/views (single-page, no router needed for V1):
- **Create**: form (hero name, theme, chapter count 3–10, art style presets) → big Generate button.
- **Progress**: live chapter list fed by SSE — text appears, image slots show spinners then art.
- **Reader**: finished book view, page-turn layout, per-scene Regenerate button.
- **Export**: download HTML/PDF button.

State: React Query or plain `fetch` + `EventSource`. Keep deps minimal: `react`, `vite`,
`tailwindcss`. No auth in V1 (random tunnel URL *is* the access control; don't share it).

### 3. Kaggle notebook (`kaggle_storybook.ipynb`, new, ~10 cells)
1. CONFIG (book defaults, tunnel note).
2. GPU check (`nvidia-smi`).
3. Install: `zstd`, Ollama, Forge deps (reuse the fixed install order:
   `setuptools<81` → requirements loop skipping `setuptools==`/`scikit-image==` →
   `scikit-image==0.22.0` → `numpy==1.26.2`), Node 20, cloudflared.
4. Clone this repo (`git clone <repo> /kaggle/working/storybook`) — code lives on GitHub,
   notebook only installs and launches.
5. Start Ollama detached, pull `qwen3:8b`.
6. `npm --prefix frontend install && npm --prefix frontend run build` (≈1–2 min).
7. `pip install fastapi uvicorn requests` + start backend detached (`nohup uvicorn ... :8000`).
8. Start Forge detached with `--listen --port 7860 --skip-torch-cuda-test`, wait for
   `:7860` ready (≈4GB model download first run).
9. Start Quick Tunnel to `:8000`, print public URL. **This URL is the app.**
10. Health cell: `/api/story` dry-run (1 chapter, 1 image) before sharing the link.

### 4. Repo layout
```
illustrated-story-generator/
├── PLAN.md                  # this file
├── backend/
│   ├── main.py              # FastAPI app + static serving + job runner
│   └── prompts.py           # chapter/JSON system prompts
├── frontend/
│   ├── src/ (App, Create, Progress, Reader)
│   └── vite.config.ts
└── kaggle_storybook.ipynb   # launcher notebook (import to Kaggle per session)
```

## Milestones
- **M1 — headless book**: backend-only script produces `book.json` + PNGs for a 3-chapter
  story. Validates LLM JSON contract + Forge txt2img params. No UI.
- **M2 — UI shell**: React Create + Reader views against mock data; backend serves `dist`.
- **M3 — wired**: real generation with SSE progress; regenerate-one-scene works.
- **M4 — export + polish**: HTML/PDF export, art-style presets, mobile-readable reader.
- **M5 — launcher notebook**: full Kaggle flow from import to public URL in ~15 min.

## Budget (T4 x2, 30h/week quota)
Per 6-chapter book: ~6 LLM calls + 6 txt2img images ≈ 10–15 min GPU. A session (9h max)
comfortably produces 20+ books. Model download (~4GB Forge checkpoint) happens once per
session — reuse the VM for the whole evening.

## Risks & mitigations
- LLM emits invalid JSON → strict system prompt + one auto-retry + per-chapter status
  so one bad chapter doesn't kill the book.
- Character drift across scenes → locked `HERO_DESC` + fixed seed; V2 could add IP-Adapter.
- Tunnel URL changes per session → expected; notebook prints the new URL each run.
- Forge cold start is slow → health/dry-run cell before opening the app to anyone.
- Random URL = weak privacy → fine for family/friends; never post it publicly.
