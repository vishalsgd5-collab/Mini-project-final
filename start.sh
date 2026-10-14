#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"

if [ ! -x "$ROOT/backend/.venv/bin/python" ]; then
  python3 -m venv "$ROOT/backend/.venv"
  "$ROOT/backend/.venv/bin/pip" install -r "$ROOT/backend/requirements.txt"
fi
if [ ! -d "$ROOT/frontend/node_modules" ]; then
  (cd "$ROOT/frontend" && npm install)
fi

"$ROOT/backend/.venv/bin/python" -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --app-dir "$ROOT/backend" &
(cd "$ROOT/frontend" && npm run dev)
