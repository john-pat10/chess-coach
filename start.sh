#!/usr/bin/env bash
# Convenience launcher: sets up (if needed) and starts both the backend and
# frontend, then stops both together on Ctrl+C. macOS/Linux only -- on
# Windows just follow the two-terminal instructions in README.md instead.
set -e
cd "$(dirname "$0")"

if ! command -v stockfish >/dev/null 2>&1 && [ -z "$STOCKFISH_PATH" ]; then
  echo "Warning: no 'stockfish' found on PATH and STOCKFISH_PATH is not set."
  echo "Game analysis will fail until Stockfish is installed -- see README.md."
fi

if [ ! -d backend/.venv ]; then
  echo "Setting up backend virtualenv (first run only)..."
  python3 -m venv backend/.venv
  backend/.venv/bin/pip install -q -r backend/requirements.txt
fi

if [ ! -d frontend/node_modules ]; then
  echo "Installing frontend dependencies (first run only)..."
  (cd frontend && npm install)
fi

cleanup() {
  echo "Stopping..."
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

(cd backend && . .venv/bin/activate && uvicorn app.main:app --port 8000) &
BACKEND_PID=$!

(cd frontend && npm run dev) &
FRONTEND_PID=$!

echo ""
echo "Backend:  http://localhost:8000"
echo "Frontend: http://localhost:5173"
echo "Press Ctrl+C to stop both."
wait
