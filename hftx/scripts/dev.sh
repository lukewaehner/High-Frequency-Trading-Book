#!/usr/bin/env bash
# Run the exchange engine (port 8080) and the Next.js web app (port 3000)
# in parallel. Ctrl-C tears both down cleanly via the process-group kill.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

trap 'kill 0' EXIT INT TERM

(
  cd "$ROOT"
  cargo run -p exchange-service
) &

(
  cd "$ROOT/web"
  pnpm dev
) &

wait
