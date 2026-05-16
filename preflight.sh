#!/usr/bin/env bash
# preflight.sh — V4 full-spectrum readiness checklist
set -euo pipefail

R='\033[0;31m'; G='\033[0;32m'; Y='\033[1;33m'; B='\033[0;36m'; N='\033[0m'
PASS=0; FAIL=0
p() { PASS=$((PASS+1)); echo -e "  ${G}✅${N} $1"; }
f() { FAIL=$((FAIL+1)); echo -e "  ${R}❌${N} $1"; }
w() { echo -e "  ${Y}⚠️ ${N}$1"; }
h() { echo -e "\n${B}━━━ $1 ━━━${N}"; }

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${MESHTASTIC_PORT:-/dev/ttyUSB0}"

h "1. SYSTEM"
command -v node &>/dev/null && p "node $(node -v)" || f "node missing"
for m in "@meshtastic/core" "@meshtastic/transport-node-serial" "@earendil-works/pi-coding-agent" "@earendil-works/pi-ai"; do
  node -e "import('$m')" 2>/dev/null && p "$m" || f "$m missing"
done

h "2. HARDWARE"
[ -c "$PORT" ] && p "$PORT present" || f "$PORT missing"
PERMS=$(stat -c %a "$PORT" 2>/dev/null || echo "???")
[ "$PERMS" = "666" ] || groups | grep -q dialout && p "$PORT perms=$PERMS" || w "$PORT perms=$PERMS — run: sudo chmod 666 $PORT"
stty -F "$PORT" 2>/dev/null | head -1 | grep -q "speed" && p "stty works" || f "$PORT has IO error — replug USB"

h "3. SOURCE CODE"
for f in "$DIR"/src/*.js; do
  node --check "$f" 2>/dev/null && p "syntax: $(basename $f)" || f "syntax: $(basename $f)"
done
grep -q 'onMeshPacket' "$DIR/src/meshtastic.js" && p "handler: onMeshPacket" || f "onMeshPacket missing"
grep -q 'payloadVariant' "$DIR/src/meshtastic.js" && p "protobuf: payloadVariant" || f "payloadVariant missing"
grep -q 'MESH.myNodeId' "$DIR/src/meshtastic.js" && p "echo filter: own-node-id" || f "echo filter missing"
grep -q 'portnum' "$DIR/src/meshtastic.js" && p "protobuf: portnum (lowercase)" || f "portnum casing wrong"
grep -q 'uncaughtException' "$DIR/src/gateway.js" && p "crash handler: uncaughtException" || f "crash handler missing"
grep -q 'createAgentSession' "$DIR/src/agent.js" && p "agent: SDK (not HTTP)" || f "agent uses wrong API"
! grep -q 'fetch\|http://' "$DIR/src/agent.js" && p "agent: zero HTTP calls" || f "agent should not use HTTP"

h "4. EVENT COVERAGE"
for ev in "onText" "onPosition" "onTelemetry" "onNodeInfo" "onNeighborInfo" "onWaypoint" "onTraceRoute" "onFileInfo"; do
  grep -q "$ev" "$DIR/src/gateway.js" && p "handler: $ev" || w "handler missing: $ev"
done

h "5. COMMANDS"
for cmd in "who" "battery" "where" "neighbors" "route" "waypoints" "locate" "files" "stats" "help"; do
  grep -q "!$cmd" "$DIR/src/commands.js" && p "command: !$cmd" || f "command missing: !$cmd"
done

h "6. GATEWAY PROCESS"
if pgrep -f "node src/gateway" >/dev/null 2>&1; then
  p "gateway running"
else
  w "gateway not running — start: cd $DIR && ./start.sh"
fi

echo ""
echo -e "Passed: ${G}${PASS}${N}  Failed: ${R}${FAIL}${N}"
[ "$FAIL" -eq 0 ] && echo -e "${G}✅ GREEN TO GO${N}" || echo -e "${R}❌ FIX ${FAIL} ISSUES${N}"
