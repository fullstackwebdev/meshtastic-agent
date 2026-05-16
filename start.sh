#!/usr/bin/env bash
# start.sh — V4 gateway watchdog with tmux, permissions, crash recovery
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG="/tmp/v4-gateway.log"
SOCKET="/tmp/tmux-1000/gw"
SESSION="v4"
MAX_BACKOFF=60

# ── Clean stale tmux socket ──
rm -f "$SOCKET" /tmp/tmux-1000/default 2>/dev/null

# ── Fix serial port permissions ──
sudo chmod 666 /dev/ttyUSB0 2>/dev/null || true

# ── Kill any prior gateway processes ──
pkill -f "node src/gateway" 2>/dev/null || true
sleep 1

# ── Start ──
echo "[start] launching gateway..."
echo "[start] log: $LOG"

RESTART=0
START_TIME=$(date +%s)

while true; do
  cd "$DIR"

  tmux -S "$SOCKET" new-session -d -s "$SESSION" \
    "node src/gateway.js 2>&1 | tee $LOG"

  # Wait for it to either connect or crash
  sleep 8

  # Monitor — restart if it dies
  while tmux -S "$SOCKET" has-session -t "$SESSION" 2>/dev/null; do
    sleep 5
  done

  NOW=$(date +%s)
  UPTIME=$((NOW - START_TIME))
  RESTART=$((RESTART + 1))

  DELAY=$((2 ** RESTART))
  [ "$DELAY" -gt "$MAX_BACKOFF" ] && DELAY=$MAX_BACKOFF

  echo "[start] $(date): crashed after ${UPTIME}s (restart #${RESTART}, waiting ${DELAY}s)" | tee -a "$LOG"
  sleep "$DELAY"

  sudo chmod 666 /dev/ttyUSB0 2>/dev/null || true
  rm -f "$SOCKET" 2>/dev/null
done
