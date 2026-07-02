#!/usr/bin/env bash
# Locally visualize the documentation website.
# Usage: ./preview.sh [port]   (default port: 3000)
set -euo pipefail

cd "$(dirname "$0")"
PORT="${1:-3000}"

# 1. Make sure submodules (external repo docs) are present.
echo "==> Syncing git submodules..."
git submodule update --init --recursive

# 2. Install dependencies only if needed.
if [ ! -d node_modules ]; then
  echo "==> Installing npm dependencies..."
  npm install
fi

# 3. Start the dev server (prestart syncs external docs + regenerates the tools table).
echo "==> Starting Docusaurus at http://localhost:${PORT}/ (Ctrl+C to stop)"
npm run start -- --port "${PORT}"
