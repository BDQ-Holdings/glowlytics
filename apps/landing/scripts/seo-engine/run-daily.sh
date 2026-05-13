#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"
export SEO_TIMEZONE="${SEO_TIMEZONE:-America/Denver}"
export DAILY_BATCH_SIZE="${DAILY_BATCH_SIZE:-10}"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm not found in PATH. Set PATH in cron or install Node.js." >&2
  exit 1
fi

npm run seo:daily
