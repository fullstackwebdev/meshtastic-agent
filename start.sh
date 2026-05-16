#!/usr/bin/env bash
# dev.sh — run the gateway directly, all logs to stdout
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[dev] fixing permissions..."
sudo chmod 666 /dev/ttyUSB0 2>/dev/null || true

echo "[dev] starting gateway on /dev/ttyUSB0..."
cd "$DIR"
exec node src/gateway.js
