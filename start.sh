#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

pkill -f "node src/gateway" 2>/dev/null || true
sudo chmod 666 /dev/ttyUSB0 2>/dev/null || true
cd "$DIR"
exec node src/gateway.js
