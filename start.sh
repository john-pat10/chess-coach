#!/usr/bin/env bash
# Runs ChessCoach locally at http://localhost:5173. (Not needed for the hosted
# GitHub Pages version.)
set -e
cd "$(dirname "$0")/frontend"
if [ ! -d node_modules ]; then
  echo "Installing dependencies (first run only)..."
  npm install
fi
npm run dev
