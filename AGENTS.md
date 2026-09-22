# AGENTS.md

## Commands

- Backend run: `cd backend && DATA_DIR=./books uvicorn main:app --port 8000` (`main:app`, not `backend.main`).
- Frontend build: `npm --prefix frontend run build`; dev: `npm --prefix frontend run dev` (proxies `/api`, `/books` → `:8000`).
- Verify backend: `python3 -m py_compile backend/*.py`. No pytest/vitest/lint/CI exist — this plus the stub recipe below plus `vite build` is the full gate.
- GPU-less check (Ollama/Forge unreachable → offline fallbacks kick in, which is expected):
  ```python
  import sys, types
  sys.path.insert(0, "backend")
  hx = types.ModuleType("httpx"); hx.Client = lambda **k: None; hx.get = lambda *a, **k: None
  sys.modules["httpx"] = hx
  fa = types.ModuleType("fastapi")
  fa.HTTPException = type("HTTPException", (Exception,), {})
  fa.APIRouter = fa.FastAPI = object
  sys.modules["fastapi"] = fa
  ```

## Backend conventions (must follow)

- New modules MUST use the dual-import pattern or they break under uvicorn (`cwd=backend`):
  ```python
  try:
      from .store import ensure_book
  except ImportError:
      from store import ensure_book
  ```
- `import backend.config` (or anything importing it) **mkdirs `DATA_DIR`** (default `<repo>/books`). Always set `DATA_DIR=/tmp/...` in throwaway tests.
- `async def` endpoints must never call blocking boto3/Forge directly — use `await asyncio.to_thread(...)`. Sync `def` endpoints run in FastAPI's threadpool, blocking is fine there.
- SSE: every stream sends `: ping` every 25s; frontend pairs `EventSource` with a 10–15s poll fallback. New event types are picked up automatically by `ChatPane` (it refetches on any non-snapshot event) — no handler update needed.
- `BOOKS` (store.py) is books; `PROJECTS` (projects.py) is workspaces. A version links `project → book_id`; never duplicate PNGs into projects.
- Pydantic specs that take an index need `Field(ge=0)` (`ChatSpec`, `Regenerate`, `PreviewSpec`, `ApproveSpec`). Never silently clamp out-of-range indices — reply/raise instead.
- LLM-derived values (`chapters`, `seed`, enums) need coercion + allowlist fallback at trust boundaries; `parse_plan_json` (agent.py) is the reference pattern.

## Frontend conventions

- `frontend/src/api.js` is the only fetch layer. New endpoints get a method there first; component-level `fetch` is a bug.
- `App.jsx` owns `project` state; `onChanged(project)` refreshes it. `ChapterCard.onChanged` receives a *book* — wrap with `api.getProject` before passing up (see `Canvas.jsx`).
- Chat chips that act on a page must be `disabled` when nothing is selected — the backend defaults a null selection to page 1.

## Gotchas

- `npm install` rewrites `frontend/package-lock.json` (`"peer": true` noise). Revert it unless deps actually changed.
- Never edit `kaggle_storybook.ipynb` via `python3 -c "..."` — bash eats backticks. Write a script file and run it.
- `books/`, `frontend/dist/`, `node_modules/`, `__pycache__/`, `.env` are gitignored. Don't commit build artifacts or secrets (see `.env.example`).
- `PLAN.md` is the historical v1 design doc; the chat/projects architecture (v2) intentionally diverges from it.
- Generation is Kaggle-only (Ollama + Forge SD1.5); R2 is backup-only. Keep it that way — no cloud-LLM dependencies.
- Commit/push/PR only when explicitly asked. PRs via `gh pr create --base main`.
