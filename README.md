# Storybook Studio

Chat-first studio for making **any type of illustrated book** — picture books, comics/manga,
chapter books, cookbooks, textbooks, brand books. Describe the book in chat, approve the
agent's plan card, and watch pages stream into the canvas. Runs 100% on free Kaggle GPU.

## How it works

```
You ──chat──▶ Planner agent (Ollama qwen3:8b) ──plan card──▶ You approve
                                                      │
                                                      ▼
                                              BOOK.md bible written
                                              (premise, hero lock, style, beats)
                                                      │
                                                      ▼
                                    Writer → Critic (≤2 rewrites) → Forge SD1.5
                                    renders each scene (CLIP re-roll gate,
                                    IP-Adapter hero reference) → cover, PDF, MP4
```

- **Supervised agent**: nothing generates until you approve the plan. Chat `redraw this page` /
  `rewrite shorter` with a page selected to revise.
- **Consistency stack**: locked hero descriptor in every prompt → IP-Adapter reference portrait
  → CLIP hero-match re-rolls.
- **One pipeline, six templates**: `picture`, `comic`, `chapter`, `cookbook`, `textbook`, `brand`
  (`GET /api/book-types`). Templates only tune prompts/layouts.
- **Projects, not files**: each project holds `BOOK.md` + chat history + a version timeline.
  Optional Cloudflare R2 backup; without keys everything is local.

## Run on Kaggle (primary)

1. Import `kaggle_storybook.ipynb` into Kaggle. Enable **Internet** + **GPU (T4 x2)**.
2. Run cells top to bottom: GPU check → system deps → clone → backend/Forge deps →
   Ollama + `qwen3:8b` → frontend build → backend `:8000` → DreamShaper checkpoint →
   Forge `:7860` → cloudflared tunnel.
3. The **APP URL** printed by the tunnel cell is the studio. Open it, start a project, chat.
4. After `git push`, re-run from the relaunch cell (`scripts/relaunch.sh`).

First run downloads ~4GB of models; keep the session alive for the evening (~20+ books per
session at ~10–15 min per 6-chapter book).

## Run locally (dev, no GPU needed)

Ollama/Forge calls degrade gracefully — the planner, critic, and chat fall back to
deterministic offline behavior, so the full UI works without models.

```bash
pip install -r backend/requirements.txt
npm --prefix frontend install && npm --prefix frontend run build
cd backend && DATA_DIR=./books uvicorn main:app --port 8000
# open http://localhost:8000
```

Vite dev mode (proxies `/api` + `/books` to `:8000`):

```bash
npm --prefix frontend run dev   # http://localhost:5173
```

## API overview

| Area | Endpoints |
|---|---|
| Agent | `POST /api/projects` · `GET /api/projects` · `GET /api/projects/{pid}` · `POST /api/projects/{pid}/chat` · `POST /api/projects/{pid}/plan/approve` · `GET /api/projects/{pid}/events` (SSE) |
| Bible | `GET/PUT /api/projects/{pid}/bible` |
| Books (classic, per version) | `GET /api/story/{id}` · `GET /api/story/{id}/events` (SSE) · `POST .../regenerate` · `POST .../preview` · `POST .../approve` · `POST .../cover` · `POST .../audiobook` · `GET .../export?format=html\|pdf` |
| Misc | `GET /api/health` · `GET /api/book-types` · `GET /api/styles` · `GET /api/loras` · `POST /api/suggest` · `POST /api/reference` · `GET /api/books` |

## Repo layout

```
backend/
  routes.py      # all HTTP endpoints (classic books + projects/chat)
  agent.py       # planner / critic / freeform roles (one LLM, many prompts)
  projects.py    # project store: BOOK.md + messages + version timeline
  story.py       # generation pipeline: chapters (Ollama) + scenes (Forge)
  bible.py       # BOOK.md read/write/parse
  templates.py   # 6 book-type templates (writer + art hints)
  images.py      # Forge txt2img + IP-Adapter plumbing
  quality.py     # CLIP hero-match gate (optional, degrades to None)
  store.py       # in-memory book registry + SSE fan-out + disk reload
  storage.py     # R2/S3 backup (optional, local-only when unconfigured)
  pdf_export.py  # reportlab picture-book PDF
  audiobook.py   # edge-tts + ffmpeg MP4 + VTT captions
  config.py      # env-driven settings + shared httpx client
frontend/src/
  App.jsx            # Studio shell: sidebar | chat+canvas | inspector
  api.js             # single API surface — keep method names in sync
  components/
    ChatPane.jsx ProjectsSidebar.jsx Canvas.jsx Inspector.jsx
    AgentManager.jsx ExportBar.jsx ChapterCard.jsx ReaderView.jsx ...
kaggle_storybook.ipynb  # Kaggle launcher (install → serve → tunnel)
scripts/relaunch.sh     # pull + rebuild-if-changed + restart backend
PLAN.md                 # original design doc (historical; v2 diverged)
```

## Environment

See `.env.example`. Defaults work on Kaggle. Key vars: `OLLAMA_URL`, `FORGE_URL`,
`LLM_MODEL` (`qwen3:8b`), `DATA_DIR` (`/kaggle/working/books` on Kaggle),
`R2_ENDPOINT/R2_KEY/R2_SECRET/R2_BUCKET` (optional cloud backup), plus tuning
(`RENDER_CFG`, `RENDER_SAMPLER`, `HERO_SCORE_MIN`, `HERO_REROLLS`, `IP_ADAPTER_WEIGHT`,
`AUDIOBOOK_VOICE`). Never commit `.env`.
