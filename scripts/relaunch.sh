#!/usr/bin/env bash
# Pull latest code and restart the backend (Kaggle cell or local dev).
# Usage: WORK=/kaggle/working/storybook bash scripts/relaunch.sh
# Env used (all optional, sane defaults): DATA_DIR, LLM_MODEL, OLLAMA_URL,
# FORGE_URL, PORT, R2_ENDPOINT/R2_KEY/R2_SECRET/R2_BUCKET, plus anything in
# $WORK/.env (local secrets file, never committed).
set -euo pipefail

WORK="${WORK:-/kaggle/working/storybook}"
DATA_DIR="${DATA_DIR:-/kaggle/working/books}"
LLM_MODEL="${LLM_MODEL:-qwen3:8b}"
OLLAMA_URL="${OLLAMA_URL:-http://127.0.0.1:11434}"
FORGE_URL="${FORGE_URL:-http://127.0.0.1:7860}"
PORT="${PORT:-8000}"

cd "$WORK"
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

git pull --ff-only

CHANGED="$(git diff --name-only HEAD@{1} HEAD 2>/dev/null || echo frontend/)"
if echo "$CHANGED" | grep -q '^frontend/'; then
  echo "frontend changed — rebuilding…"
  (cd frontend && npm install --no-audit --no-fund && npm run build)
else
  echo "frontend unchanged — skipping build"
fi

pkill -f "uvicorn main:app" 2>/dev/null || true
sleep 2
mkdir -p "$DATA_DIR"
cd backend
export DATA_DIR LLM_MODEL OLLAMA_URL FORGE_URL
nohup uvicorn main:app --host 127.0.0.1 --port "$PORT" > /tmp/storybook.log 2>&1 &
sleep 6
curl -s "http://127.0.0.1:$PORT/api/health"
echo
