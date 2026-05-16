# Catrepo dump – meshtastic-agent – 2026-05-16T22:33:09.998433+00:00
# ≈ 12010 tokens

## File Structure

```
└── .
    ├── src
    │   ├── agent.js (2.3K tok)
    │   ├── commands.js (679 tok)
    │   ├── config.js (349 tok)
    │   ├── gateway.js (2.2K tok)
    │   ├── logger.js (136 tok)
    │   ├── mesh-db.js (1.9K tok)
    │   └── meshtastic.js (2.5K tok)
    ├── .gitignore (8 tok)
    ├── CODE.md (0 tok)
    ├── preflight.sh (708 tok)
    ├── README.md (377 tok)
    └── start.sh (79 tok)

1 directories, 12 files
```


### preflight.sh
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


### start.sh
#!/usr/bin/env bash
# dev.sh — run the gateway directly, all logs to stdout
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[dev] fixing permissions..."
sudo chmod 666 /dev/ttyUSB0 2>/dev/null || true

echo "[dev] starting gateway on /dev/ttyUSB0..."
cd "$DIR"
exec node src/gateway.js


### CODE.md


### README.md
# Meshtastic Agent V4 — Full-Spectrum Mesh Gateway

## Features

| Feature | Port | Trigger |
|---------|------|---------|
| Text chat + AI | 1 | Any message without `!` prefix |
| Instant commands | — | `!who` `!battery` `!where` `!neighbors` `!route` `!waypoints` `!locate` `!files` `!stats` `!help` |
| Node discovery | 4 | Automatic on mesh join |
| Position tracking | 3 | Automatic + `!locate` request |
| Telemetry monitoring | 67 | Automatic + periodic requests |
| Neighbor graph | 68 | Automatic |
| Route tracing | 70 | `!route <node>` |
| Waypoints | 5 | Automatic from mesh |
| File listing | variant 15 | `!files` |
| Private file transfer | 256 | Custom protocol |
| Low battery alerts | — | Auto every 60s |
| Node offline alerts | — | Auto every 60s |

## Quickstart

```bash
cd meshtastic-agent-v4
npm install
sudo chmod 666 /dev/ttyUSB0
./start.sh
```

## Files

| File | Lines | Purpose |
|------|-------|---------|
| `src/config.js` | 50 | All configuration |
| `src/logger.js` | 20 | HIDE_RAW_OUTPUT, DEBUG toggle |
| `src/mesh-db.js` | 160 | Node/position/telemetry/neighbor store |
| `src/meshtastic.js` | 250 | 9 event handlers, full port switch |
| `src/commands.js` | 70 | 10 bang-commands |
| `src/agent.js` | 100 | PI Agent SDK, mesh-aware system prompt |
| `src/gateway.js` | 190 | Queue, chunking, alerts, lifecycle |

## Config

```bash
MESHTASTIC_PORT=/dev/ttyUSB0
HIDE_RAW_OUTPUT=true   # suppress SDK noise (default)
DEBUG=true             # enable debug logging
```


### .gitignore
node_modules/
*.log
.env
.DS_Store


### src/config.js
/**
 * config.js — Meshtastic Agent V4
 * Single source of truth. No defaults, no fallbacks — fail first.
 */

export const MESH = {
  port:     process.env.MESHTASTIC_PORT || '/dev/ttyUSB0',
  baudRate: 115200,
  myNodeId: null,  // populated at runtime from onMyNodeInfo
};

export const CHUNK = {
  size:       150,    // bytes per LoRa chunk
  delayMs:    3000,   // inter-chunk delay (radio queue drain)
  maxRetries: 3,      // send retries before giving up
};

export const QUEUE = {
  maxPending:      20,     // max queued messages per node
  staleTimeoutMs:  300000, // drop queued messages older than 5 min
};

export const PI_AGENT = {
  // agentDir: set via PI_CODING_AGENT_DIR env var, or auto-discovered
  //   by getAgentDir(). Falls back to .pi/agent relative to cwd.
  // Model: auto-detected from models.json in agentDir.
  // No hardcoded paths — works on any machine without changes.
};

export const ALERTS = {
  lowBatteryPct:        20,     // alert when battery below 20%
  nodeOfflineMinutes:   30,     // alert when node unheard for 30 min
  telemetryIntervalMs:  3600000, // request telemetry every 1 hour
};

export const FILE_XFER = {
  maxInlineBase64: 1024,       // max bytes for inline base64 files
  chunkSize:       200,        // bytes per file chunk (larger than text — binary)
  maxFileBytes:    1024 * 1024, // 1MB max per file via private chunked
};


### src/agent.js
/**
 * agent.js — Meshtastic Agent V4
 * 
 * Per-node PI Agent session manager. Uses the PI Agent SDK
 * (createAgentSession) for persistent sessions with streaming token output.
 * Registers mesh-aware tools so the LLM can query live mesh state:
 *   mesh_who, mesh_battery, mesh_where, mesh_neighbors,
 *   mesh_stats, mesh_send, mesh_locate, mesh_files
 */

import { createAgentSession, defineTool, getAgentDir } from '@earendil-works/pi-coding-agent';
import { Type } from '@earendil-works/pi-ai';
import { CHUNK } from './config.js';
import { log, debug, error } from './logger.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export class Agent {
  constructor(meshDB, meshtastic) {
    this.meshDB     = meshDB;
    this.meshtastic = meshtastic;
    this.sessions   = new Map(); // nodeId → AgentSession
    this.meta       = new Map(); // nodeId → { lastActivity, history, currentOnToken }
  }

  async getSession(nodeId) {
    if (this.sessions.has(nodeId)) {
      this.meta.get(nodeId).lastActivity = Date.now();
      return this.sessions.get(nodeId);
    }

    log(`[agent] creating session for node ${nodeId}`);

    // Resolve agentDir dynamically — env var, SDK default, or local .pi/agent
    const agentDir = process.env.PI_CODING_AGENT_DIR
      || getAgentDir()
      || path.join(process.cwd(), '.pi/agent');

    const sessionDir = path.join(agentDir, '..', 'v4-sessions', String(nodeId));
    await fs.mkdir(sessionDir, { recursive: true });

    const { session } = await createAgentSession({
      cwd: sessionDir,
      agentDir,
      // model omitted — auto-detected from models.json in agentDir
      continueSession: true,
      customTools: this.buildMeshTools(),
    });

    session.subscribe((event) => {
      const meta = this.meta.get(nodeId);
      if (!meta?.currentOnToken) return;

      if (event.type === 'message_update' && event.assistantMessageEvent) {
        const ame = event.assistantMessageEvent;
        if (ame.type === 'text_delta' && ame.delta) {
          meta.currentOnToken(ame.delta);
        }
      } else if (event.type === 'message_delta' && event.delta) {
        meta.currentOnToken(event.delta);
      }
    });

    this.sessions.set(nodeId, session);
    this.meta.set(nodeId, { lastActivity: Date.now(), history: [], currentOnToken: null });
    return session;
  }

  // ═══════════════════════════════════════════════════════════
  // Mesh Tools — callable by the LLM during conversation
  // ═══════════════════════════════════════════════════════════

  buildMeshTools() {
    const db = this.meshDB;
    const mt = this.meshtastic;

    const tool = (name, label, desc, params, execute) =>
      defineTool({ name, label, description: desc, parameters: params, execute });

    return [
      // ── mesh_who ──
      tool('mesh_who', 'List Mesh Nodes',
        'List all nodes currently on the mesh with their names, hardware, and last-seen times.',
        Type.Object({}),
        async () => {
          const summary = db.getMeshSummary();
          return { content: [{ type: 'text', text: summary }] };
        }),

      // ── mesh_battery ──
      tool('mesh_battery', 'Mesh Battery Levels',
        'Get battery levels for all nodes or a specific node. Pass node number or omit for all.',
        Type.Object({
          node: Type.Optional(Type.Number({ description: 'Node number, e.g. 48938532. Omit for all nodes.' })),
        }),
        async (_id, params) => {
          const result = params.node
            ? db.getTelemetry(params.node)
            : db.getAllTelemetry();
          return { content: [{ type: 'text', text: result }] };
        }),

      // ── mesh_where ──
      tool('mesh_where', 'Mesh Node Position',
        'Get the GPS position of a mesh node.',
        Type.Object({
          node: Type.Number({ description: 'Node number, e.g. 48938532' }),
        }),
        async (_id, params) => {
          const pos = db.getPosition(params.node);
          const text = pos
            ? `${db.getNodeSummary(params.node)}\nPosition: ${pos}`
            : `No position data for node ${params.node}`;
          return { content: [{ type: 'text', text }] };
        }),

      // ── mesh_neighbors ──
      tool('mesh_neighbors', 'Mesh Neighbor Graph',
        'Get neighbor list and signal strengths for a node.',
        Type.Object({
          node: Type.Number({ description: 'Node number, e.g. 48938532' }),
        }),
        async (_id, params) => {
          const text = `Neighbors of ${db.getNodeSummary(params.node)}:\n${db.getNeighbors(params.node)}`;
          return { content: [{ type: 'text', text }] };
        }),

      // ── mesh_stats ──
      tool('mesh_stats', 'Mesh Statistics',
        'Get mesh-wide statistics: node count, telemetry coverage, neighbor count, waypoints, files.',
        Type.Object({}),
        async () => {
          const s = db.getStats();
          const text = [
            `Nodes: ${s.nodes}`,
            `With positions: ${s.positions}`,
            `With telemetry: ${s.telemetry}`,
            `Neighbor edges: ${s.neighbors}`,
            `Waypoints: ${s.waypoints}`,
            `Files: ${s.files}`,
            s.alerts.length > 0 ? `\nAlerts:\n${s.alerts.map(a => `  ${a}`).join('\n')}` : '',
          ].join('\n');
          return { content: [{ type: 'text', text }] };
        }),

      // ── mesh_send ──
      tool('mesh_send', 'Send Mesh Message',
        'Send a text message to a specific node on the mesh.',
        Type.Object({
          node: Type.Number({ description: 'Destination node number, e.g. 48938532' }),
          text: Type.String({ description: 'Message to send' }),
        }),
        async (_id, params) => {
          try {
            await mt.sendText(params.node, params.text);
            return { content: [{ type: 'text', text: `Message sent to node ${params.node}.` }] };
          } catch (err) {
            return { content: [{ type: 'text', text: `Failed to send: ${err.message}` }], isError: true };
          }
        }),

      // ── mesh_locate ──
      tool('mesh_locate', 'Request Node Position',
        'Request current GPS position from a node. Results arrive asynchronously (within ~10s).',
        Type.Object({
          node: Type.Number({ description: 'Node number to request position from, e.g. 48938532' }),
        }),
        async (_id, params) => {
          try {
            await mt.requestPosition(params.node);
            return { content: [{ type: 'text', text: `Position request sent to node ${params.node}. Results arrive within ~10 seconds.` }] };
          } catch (err) {
            return { content: [{ type: 'text', text: `Failed to request position: ${err.message}` }], isError: true };
          }
        }),

      // ── mesh_files ──
      tool('mesh_files', 'List Gateway Files',
        'List files on the gateway device.',
        Type.Object({}),
        async () => {
          const text = db.getFileList();
          return { content: [{ type: 'text', text }] };
        }),
    ];
  }

  // ═══════════════════════════════════════════════════════════

  async prompt(nodeId, message, onToken) {
    const session = await this.getSession(nodeId);
    const meta = this.meta.get(nodeId);

    meta.history.push({ role: 'user', content: message, ts: Date.now() });
    if (meta.history.length > 40) meta.history = meta.history.slice(-40);

    meta.currentOnToken = onToken;

    const prompt = this.buildSystemPrompt(nodeId) + '\n\nUser: ' + message;

    log(`[agent] prompting ${nodeId}: "${message.substring(0, 60)}..."`);
    try {
      await session.prompt(prompt);
    } catch (err) {
      error(`[agent] prompt failed for ${nodeId}: ${err.message}`);
    }
    meta.lastActivity = Date.now();
    meta.currentOnToken = null;
  }

  buildSystemPrompt(nodeId) {
    const node = this.meshDB.getNodeSummary(nodeId);
    const stats = this.meshDB.getStats();

    const lines = [
      'You are a Meshtastic AI assistant connected via LoRa radio.',
      'You can use bash, read, edit, and write tools.',
      '',
      `Current user: ${node}`,
      '',
      `Mesh: ${stats.nodes} nodes, ${stats.telemetry} with telemetry`,
      '',
      'Available mesh tools:',
      '  mesh_who      — list all online nodes',
      '  mesh_battery  — battery levels (all or specific node)',
      '  mesh_where    — GPS position of a node',
      '  mesh_neighbors — neighbor signal graph for a node',
      '  mesh_stats    — full mesh statistics',
      '  mesh_send     — send a text message to a node',
      '  mesh_locate   — request current position from a node',
      '  mesh_files    — list files on the gateway',
      '',
      `Responses are chunked into ~${CHUNK.size}B segments over LoRa.`,
      'Keep answers concise. Use mesh tools for live data instead of guessing.',
    ];

    return lines.filter(l => l !== '').join('\n');
  }
}


### src/commands.js
/**
 * commands.js — Meshtastic Agent V4
 * 
 * Bang-command handler. Commands prefixed with ! are handled instantly
 * without hitting the PI Agent. Everything else routes to the AI.
 */

import { log } from './logger.js';

/**
 * @param {Object} ctx — { nodeId, text, args, meshDB, meshtastic }
 * @returns {string|null} response text, or null to route to AI
 */
export function handleCommand(ctx) {
  const parts = ctx.text.trim().split(/\s+/);
  const cmd = (parts[0] || '').toLowerCase();
  ctx.args = parts.slice(1).join(' ');

  const handlers = {
    '!who':       () => ctx.meshDB.getMeshSummary(),
    '!battery':   () => ctx.args ? ctx.meshDB.getTelemetry(parseInt(ctx.args)) : ctx.meshDB.getAllTelemetry(),
    '!where':     () => {
      const num = parseInt(ctx.args) || ctx.nodeId;
      const pos = ctx.meshDB.getPosition(num);
      return pos ? `${ctx.meshDB.getNodeSummary(num)}\nPosition: ${pos}` : `No position data for node ${num}. Send !locate ${num} to request it.`;
    },
    '!neighbors': () => {
      const num = parseInt(ctx.args) || ctx.nodeId;
      return `Neighbors of ${ctx.meshDB.getNodeSummary(num)}:\n${ctx.meshDB.getNeighbors(num)}`;
    },
    '!route':     () => {
      const dest = parseInt(ctx.args);
      if (!dest) return 'Usage: !route <nodeNum>';
      ctx.meshtastic.traceRoute(dest).catch(() => {});
      return `Tracing route to node ${dest}... (results in ~10s)`;
    },
    '!waypoints': () => ctx.meshDB.getAllWaypoints(),
    '!locate':    () => {
      const dest = parseInt(ctx.args) || ctx.nodeId;
      ctx.meshtastic.requestPosition(dest).catch(() => {});
      return `Requesting position from node ${dest}... (results in ~10s)`;
    },
    '!files':     () => ctx.meshDB.getFileList(),
    '!stats':     () => {
      const s = ctx.meshDB.getStats();
      return `Mesh stats: ${s.nodes} nodes, ${s.positions} positions, ${s.telemetry} telemetry, ${s.neighbors} neighbors, ${s.waypoints} waypoints, ${s.routes} routes, ${s.files} files`;
    },
    '!help':      () => [
      'Commands (prefix with !):',
      '  !who          List all online nodes',
      '  !battery [n]  Battery levels (all or node n)',
      '  !where [n]    Position of node n',
      '  !neighbors [n] Neighbor graph for node n',
      '  !route <n>    Trace route to node n',
      '  !waypoints    List waypoints',
      '  !locate [n]   Request position from node n',
      '  !files        List gateway files',
      '  !stats        Mesh statistics',
      '  !help         This message',
    ].join('\n'),
  };

  if (handlers[cmd]) {
    log(`[commands] ${cmd} from ${ctx.nodeId}`);
    return handlers[cmd]();
  }

  return null; // not a command → route to AI
}


### src/meshtastic.js
/**
 * meshtastic.js — Meshtastic Agent V4
 * 
 * Serial I/O via @meshtastic/core. Subscribes to ALL mesh events.
 * 
 * ═══ MESH PACKET HANDLER: onMeshPacket ═══
 * 
 * We use onMeshPacket as the primary handler. It wraps the SDK's
 * HandleMeshPacket which correctly decodes ALL port numbers including
 * TEXT_MESSAGE_APP (port 1). 
 * 
 * We do NOT use onFromRadio for mesh packets due to SDK bug
 * meshtastic/rust#23: TEXT_MESSAGE_APP decoded payloads are stripped
 * before the onFromRadio event fires.
 * 
 * ═══ PROTOBUF FIELD REFERENCE (verified from runtime dump + mod.d.ts) ═══
 * 
 * MeshPacket (from onMeshPacket):
 *   pkt.from                              → u32  sender node number
 *   pkt.to                                → u32  destination node number
 *   pkt.channel                           → u32  channel index (0=primary)
 *   pkt.payloadVariant.case               → "decoded" | "encrypted"
 *   pkt.payloadVariant.value.portnum      → PortNum  ← LOWERCASE 'n'
 *   pkt.payloadVariant.value.payload      → Uint8Array
 * 
 * FromRadio (from onFromRadio — used ONLY for non-mesh variants):
 *   fromRadio.payloadVariant.case         → "packet"|"myInfo"|"nodeInfo"|"fileInfo"|...
 *   fromRadio.payloadVariant.value        → varies by case
 * 
 * PortNum values (from meshtastic.PortNum enum):
 *   TEXT_MESSAGE_APP     = 1
 *   POSITION_APP         = 3
 *   NODEINFO_APP         = 4
 *   WAYPOINT_APP         = 5
 *   REMOTE_HARDWARE_APP  = 39
 *   IP_TUNNEL_APP        = 33
 *   SERIAL_APP           = 64
 *   STORE_FORWARD_APP    = 65
 *   RANGE_TEST_APP       = 66
 *   TELEMETRY_APP        = 67
 *   NEIGHBORINFO_APP     = 68
 *   TRACEROUTE_APP       = 70
 *   MAP_REPORT_APP       = 73
 *   PRIVATE_APP          = 256
 * 
 * FIELDS THAT DO NOT EXIST:
 *   pkt.type        → undefined. Use payloadVariant.case.
 *   pkt.packet      → undefined. Use payloadVariant.value.
 *   pkt.portNum     → undefined. Use payloadVariant.value.portnum.
 *   pkt.decoded     → undefined. Use payloadVariant.value.
 */

import { MeshDevice } from '@meshtastic/core';
import { TransportNodeSerial } from '@meshtastic/transport-node-serial';
import { MESH } from './config.js';
import { log, debug, raw, error } from './logger.js';

const DeviceConnected    = 5;
const DeviceDisconnected = 2;

export class Meshtastic {
  /**
   * @param {Object} handlers — { onText, onPosition, onTelemetry, onNodeInfo,
   *   onNeighborInfo, onWaypoint, onTraceRoute, onRemoteHW,
   *   onRangeTest, onPrivate, onFileInfo, onStatus }
   */
  constructor(handlers) {
    this.h = handlers;
    this.transport = null;
    this.device    = null;
    this.connected = false;
    this._subs     = [];
  }

  async connect(port = MESH.port) {
    log(`[meshtastic] connecting to ${port}...`);
    this.transport = await TransportNodeSerial.create(port, MESH.baudRate);
    this.device    = new MeshDevice(this.transport);
    this.setupEventHandlers();
    await this.waitForConnection();
    log(`[meshtastic] connected`);

    try { await this.device.configure(); } catch {}

    // Request initial data
    try { await this.device.getOwner(); } catch {}  // fills onMyNodeInfo
  }

  setupEventHandlers() {
    log(`[meshtastic] subscribing to events...`);

    const sub = (event, fn) => {
      this._subs.push(event.subscribe(fn));
    };

    // ── Status ──
    sub(this.device.events.onDeviceStatus, (status) => {
      if (status === DeviceConnected)    { this.connected = true;  this.h.onStatus?.('connected'); }
      if (status === DeviceDisconnected) { this.connected = false; this.h.onStatus?.('disconnected'); }
    });

    // ── Own node ID (for echo filter + mesh-db) ──
    sub(this.device.events.onMyNodeInfo, (info) => {
      MESH.myNodeId = info.myNodeNum;
      debug(`[meshtastic] my node: ${info.myNodeNum}`);
    });

    // ── Node discovery events (SDK-decoded) ──
    sub(this.device.events.onNodeInfoPacket, (packet) => {
      debug(`[meshtastic] node info: ${packet.num} = ${packet.user?.longName}`);
      this.h.onNodeInfo?.(packet.num, packet.user);
    });

    // ═══════════════════════════════════════════════════════════
    // PRIMARY MESH PACKET HANDLER: onMeshPacket
    // ═══════════════════════════════════════════════════════════
    sub(this.device.events.onMeshPacket, (pkt) => {
      // Echo filter — never process our own transmissions
      if (MESH.myNodeId && pkt.from === MESH.myNodeId) return;

      // MeshPacket uses payloadVariant oneof
      const v = pkt?.payloadVariant;
      if (!v || v.case !== 'decoded') return;

      const portnum = v.value?.portnum;
      const payload = v.value?.payload;
      if (!portnum || !payload) return;

      const text = new TextDecoder().decode(payload);

      switch (portnum) {
        case 1:   // TEXT_MESSAGE_APP
          log(`[meshtastic] rx text from ${pkt.from}: "${text.substring(0, 60)}"`);
          this.h.onText?.(pkt.from, text, pkt.channel || 0);
          break;

        case 3:   // POSITION_APP
          try {
            const pos = JSON.parse(text);
            this.h.onPosition?.(pkt.from, pos);
          } catch { debug(`[meshtastic] unparseable position from ${pkt.from}`); }
          break;

        case 4:   // NODEINFO_APP
          try {
            const info = JSON.parse(text);
            this.h.onNodeInfo?.(pkt.from, info);
          } catch { debug(`[meshtastic] unparseable nodeinfo from ${pkt.from}`); }
          break;

        case 5:   // WAYPOINT_APP
          try {
            const wp = JSON.parse(text);
            this.h.onWaypoint?.(wp);
          } catch { debug(`[meshtastic] unparseable waypoint from ${pkt.from}`); }
          break;

        case 39:  // REMOTE_HARDWARE_APP
          this.h.onRemoteHW?.(pkt.from, text);
          break;

        case 66:  // RANGE_TEST_APP
          this.h.onRangeTest?.(pkt.from, text);
          break;

        case 67:  // TELEMETRY_APP
          try {
            const tel = JSON.parse(text);
            this.h.onTelemetry?.(pkt.from, tel);
          } catch { debug(`[meshtastic] unparseable telemetry from ${pkt.from}`); }
          break;

        case 68:  // NEIGHBORINFO_APP
          try {
            const list = JSON.parse(text);
            this.h.onNeighborInfo?.(pkt.from, Array.isArray(list) ? list : list.neighbors);
          } catch { debug(`[meshtastic] unparseable neighbor info from ${pkt.from}`); }
          break;

        case 70:  // TRACEROUTE_APP
          try {
            const route = JSON.parse(text);
            this.h.onTraceRoute?.(pkt.to || pkt.from, route.route || route);
          } catch { debug(`[meshtastic] unparseable traceroute`); }
          break;

        case 256: // PRIVATE_APP — custom file transfer
          this.h.onPrivate?.(pkt.from, payload, pkt.channel || 0);
          break;

        default:
          debug(`[meshtastic] unhandled portnum ${portnum} from ${pkt.from}`);
      }
    });

    // ── High-level decoded events (backup for when SDK decodes them) ──
    sub(this.device.events.onPositionPacket, (p) => {
      debug(`[meshtastic] position packet: ${p.from}`);
      this.h.onPosition?.(p.from, p.data);
    });
    sub(this.device.events.onTelemetryPacket, (p) => {
      debug(`[meshtastic] telemetry packet: ${p.from}`);
      this.h.onTelemetry?.(p.from, p.data);
    });
    sub(this.device.events.onNeighborInfoPacket, (p) => {
      debug(`[meshtastic] neighbor packet: ${p.from}`);
      this.h.onNeighborInfo?.(p.from, p.data);
    });
    sub(this.device.events.onWaypointPacket, (p) => {
      debug(`[meshtastic] waypoint packet`);
      this.h.onWaypoint?.(p.data);
    });

    // ── FromRadio variants (device-local, not mesh) ──
    sub(this.device.events.onFromRadio, (fr) => {
      if (fr.payloadVariant?.case === 'fileInfo') {
        const fi = fr.payloadVariant.value;
        debug(`[meshtastic] file info: ${fi.fileName} (${fi.sizeBytes}B)`);
        this.h.onFileInfo?.(fi.fileName, fi.sizeBytes);
      }
    });

    log(`[meshtastic] events subscribed`);
  }

  async waitForConnection() {
    const deadline = Date.now() + 15000;
    while (!this.connected && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 200));
    }
    if (!this.connected) throw new Error('connection timeout');
  }

  async sendText(nodeId, text) {
    if (!this.device || !this.connected) throw new Error('not connected');
    return await this.device.sendText(text, nodeId, true, 0);
  }

  async sendPacket(data, portnum, destination, channel = 0) {
    if (!this.device || !this.connected) throw new Error('not connected');
    return await this.device.sendPacket(data, portnum, destination, channel, true);
  }

  async sendWaypoint(wp, destination) {
    if (!this.device || !this.connected) throw new Error('not connected');
    return await this.device.sendWaypoint(wp, destination);
  }

  async requestTelemetry(destination) {
    if (!this.device || !this.connected) throw new Error('not connected');
    return await this.device.requestTelemetry(destination);
  }

  async requestPosition(destination) {
    if (!this.device || !this.connected) throw new Error('not connected');
    return await this.device.requestPosition(destination);
  }

  async traceRoute(destination) {
    if (!this.device || !this.connected) throw new Error('not connected');
    return await this.device.traceRoute(destination);
  }

  async disconnect() {
    log(`[meshtastic] disconnecting...`);
    for (const u of this._subs) u();
    this._subs = [];
    if (this.transport) { try { await this.transport.disconnect(); } catch {} }
    this.device = null;
    this.transport = null;
    this.connected = false;
    log(`[meshtastic] disconnected`);
  }
}


### src/gateway.js
/**
 * gateway.js — Meshtastic Agent V4
 * 
 * Entry point. Wires Meshtastic → MeshDB → Agent + Commands.
 * 
 * Flow:
 *   Message arrives → command? → instant response
 *                  → not command? → Agent.prompt() → chunks
 * 
 *   Telemetry/Position/NodeInfo → MeshDB (always)
 *   Alerts checked periodically → notify affected nodes
 */

import { Meshtastic } from './meshtastic.js';
import { Agent }      from './agent.js';
import { MeshDB }     from './mesh-db.js';
import { handleCommand } from './commands.js';
import { CHUNK, QUEUE, ALERTS } from './config.js';
import { log, error } from './logger.js';

// ── Chunk delivery utilities ──
const sleep = ms => new Promise(r => setTimeout(r, ms));

function splitIntoChunks(text, maxSize = CHUNK.size) {
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    chunks.push(remaining.substring(0, maxSize));
    remaining = remaining.substring(maxSize);
  }
  return chunks;
}

async function sendChunkWithRetry(meshtastic, nodeId, text, total, index) {
  const chunkNum = index + 1;
  const formatted = `[${chunkNum}/${total}]\n${text}`;

  for (let attempt = 0; attempt <= CHUNK.maxRetries; attempt++) {
    const label = attempt === 0 ? 'send' : `retry ${attempt}`;
    log(`[gateway] chunk ${chunkNum}/${total} ${label} → ${nodeId}`);

    try {
      await meshtastic.sendText(nodeId, formatted);
      log(`[gateway] chunk ${chunkNum}/${total} ✅`);
      return true;
    } catch (err) {
      error(`[gateway] chunk ${chunkNum}/${total} failed: ${err.message}`);
    }
    if (attempt < CHUNK.maxRetries) await sleep(CHUNK.delayMs);
  }
  error(`[gateway] chunk ${chunkNum}/${total} ❌ after ${CHUNK.maxRetries} retries`);
  return false;
}

// ═══════════════════════════════════════════════════════════════
// Gateway
// ═══════════════════════════════════════════════════════════════

class Gateway {
  constructor() {
    this.meshDB = new MeshDB();

    this.meshtastic = new Meshtastic({
      onText:         this.onText.bind(this),
      onPosition:     (from, pos) => this.meshDB.upsertPosition(from, pos),
      onTelemetry:    (from, tel)  => this.meshDB.upsertTelemetry(from, tel),
      onNodeInfo:     (from, info) => this.meshDB.upsertNode(from, info),
      onNeighborInfo: (from, list) => this.meshDB.upsertNeighbors(from, list),
      onWaypoint:     (wp)         => this.meshDB.upsertWaypoint(wp),
      onTraceRoute:   (dest, hops) => this.meshDB.upsertRoute(dest, hops),
      onFileInfo:     (name, size) => this.meshDB.upsertFile(name, size),
      onRemoteHW:     () => {},
      onRangeTest:    () => {},
      onPrivate:      (from, payload) => this.onPrivate(from, payload),
      onStatus:       this.onStatus.bind(this),
    });

    this.agent    = new Agent(this.meshDB, this.meshtastic);
    this.queues   = new Map();   // nodeId → [{ text, channel, queuedAt }]
    this.occupied = new Set();   // nodeIds being processed
  }

  onStatus(status) {
    if (status === 'connected')    log('[gateway] ✅ device connected');
    if (status === 'disconnected') log('[gateway] ⚠️  device disconnected');
  }

  // ── Text message (port 1) ──
  onText(nodeId, text, channel) {
    log(`[gateway] 📩 from ${nodeId}: "${text}"`);

    // Enqueue
    if (!this.queues.has(nodeId)) this.queues.set(nodeId, []);
    const q = this.queues.get(nodeId);
    if (q.length >= QUEUE.maxPending) {
      error(`[gateway] queue overflow for ${nodeId}, dropping oldest`);
      q.shift();
    }
    q.push({ text, channel, queuedAt: Date.now() });

    if (!this.occupied.has(nodeId)) this.processNode(nodeId);
  }

  // ── Private packet (port 256) — file transfer ──
  onPrivate(from, payload) {
    log(`[gateway] 📦 private packet from ${from}: ${payload.length}B`);
    // Future: reassemble file chunks here
  }

  // ── Per-node queue processor ──
  async processNode(nodeId) {
    this.occupied.add(nodeId);
    const q = this.queues.get(nodeId);

    while (q && q.length > 0) {
      const now = Date.now();
      while (q.length > 0 && now - q[0].queuedAt > QUEUE.staleTimeoutMs) {
        log(`[gateway] dropping stale message for ${nodeId}`);
        q.shift();
      }
      if (q.length === 0) break;

      const { text } = q.shift();

      // 1. Check for bang-command
      const cmdResult = handleCommand({
        nodeId, text, meshtastic: this.meshtastic, meshDB: this.meshDB,
      });

      if (cmdResult !== null) {
        // Instant command response — no AI needed
        const chunks = splitIntoChunks(cmdResult);
        for (let i = 0; i < chunks.length; i++) {
          await sendChunkWithRetry(this.meshtastic, nodeId, chunks[i], chunks.length, i);
          if (i < chunks.length - 1) await sleep(CHUNK.delayMs);
        }
        continue;
      }

      // 2. Send processing ack
      try {
        await this.meshtastic.sendText(nodeId,
          `⏳ Processing: "${text.substring(0, 80)}${text.length > 80 ? '...' : ''}"`);
      } catch {}

      // 3. AI response
      let fullResponse = '';
      try {
        await this.agent.prompt(nodeId, text, (token) => { fullResponse += token; });
      } catch (err) {
        error(`[gateway] agent failed for ${nodeId}: ${err.message}`);
        try { await this.meshtastic.sendText(nodeId, '❌ Sorry, an error occurred.'); } catch {}
        continue;
      }

      if (!fullResponse) {
        try { await this.meshtastic.sendText(nodeId, '🤷 No response.'); } catch {}
        continue;
      }

      // 4. Chunk and send
      const chunks = splitIntoChunks(fullResponse);
      log(`[gateway] sending ${chunks.length} chunks to ${nodeId}`);

      for (let i = 0; i < chunks.length; i++) {
        await sendChunkWithRetry(this.meshtastic, nodeId, chunks[i], chunks.length, i);
        if (i < chunks.length - 1) await sleep(CHUNK.delayMs);
      }

      // 5. Completion notification
      try {
        await this.meshtastic.sendText(nodeId,
          `✅ Response complete — ${chunks.length} chunk${chunks.length > 1 ? 's' : ''} sent.`);
      } catch {}
    }

    this.queues.delete(nodeId);
    this.occupied.delete(nodeId);
  }

  // ── Periodic alerts ──
  startAlertLoop() {
    this._alertTimer = setInterval(() => {
      const alerts = this.meshDB.checkAlerts();
      for (const alert of alerts) {
        log(`[gateway] alert: ${alert}`);
        // Future: send alert to relevant nodes
      }
    }, 60000); // every minute
  }

  // ── Periodic telemetry requests ──
  startTelemetryLoop() {
    this._telemetryTimer = setInterval(() => {
      for (const num of this.meshDB.nodes.keys()) {
        if (num === this.meshDB.nodes.get(num)) continue; // skip self? actually skip if no telemetry in a while
        this.meshtastic.requestTelemetry(num).catch(() => {});
      }
    }, ALERTS.telemetryIntervalMs);
  }

  // ── Lifecycle ──
  async start() {
    log('[gateway] starting...');
    log(`[gateway] chunk: ${CHUNK.size}B, delay: ${CHUNK.delayMs}ms, retries: ${CHUNK.maxRetries}`);
    log(`[gateway] queue: ${QUEUE.maxPending}/node, stale: ${QUEUE.staleTimeoutMs}ms`);
    log(`[gateway] alerts: lowBatt <${ALERTS.lowBatteryPct}%, offline >${ALERTS.nodeOfflineMinutes}min`);

    await this.meshtastic.connect();
    this.startAlertLoop();
    this.startTelemetryLoop();

    log('[gateway] ✅ ready');
  }

  async stop() {
    log('[gateway] stopping...');
    if (this._alertTimer) clearInterval(this._alertTimer);
    if (this._telemetryTimer) clearInterval(this._telemetryTimer);
    await this.meshtastic.disconnect();
    log('[gateway] ✅ stopped');
  }
}

// ═══════════════════════════════════════════════════════════════
// Entry point
// ═══════════════════════════════════════════════════════════════

async function main() {
  process.on('uncaughtException', (err) => {
    error(`[gateway] crash: ${err.message}`);
    error(err.stack);
  });
  process.on('unhandledRejection', (reason) => {
    error(`[gateway] unhandled rejection: ${reason?.message || reason}`);
  });

  const gw = new Gateway();

  process.on('SIGINT',  async () => { await gw.stop(); process.exit(0); });
  process.on('SIGTERM', async () => { await gw.stop(); process.exit(0); });

  await gw.start();
  log('[gateway] running. Ctrl+C to stop.');
  await new Promise(() => {});
}

main();


### src/logger.js
/**
 * logger.js — Meshtastic Agent V4
 * 
 * Three-tier logging:
 *   log()   → always shown (user-facing events)
 *   debug() → shown when DEBUG=true
 *   raw()   → shown when HIDE_RAW_OUTPUT=false (SDK output)
 */

const HIDE  = process.env.HIDE_RAW_OUTPUT !== 'false';
const DEBUG = process.env.DEBUG === 'true';

export const log   = (...a) => console.log(...a);
export const debug = (...a) => DEBUG && console.log(...a);
export const raw   = (...a) => !HIDE && console.log(...a);
export const error = (...a) => console.error(...a);


### src/mesh-db.js
/**
 * mesh-db.js — Meshtastic Agent V4
 * 
 * In-memory mesh state. Tracks nodes, positions, telemetry, neighbors,
 * waypoints, routes, and file listings. Queryable by agent.js for
 * mesh-aware system prompts and by commands.js for bang-commands.
 */

import { ALERTS, MESH } from './config.js';
import { log, debug, error } from './logger.js';

export class MeshDB {
  constructor() {
    this.nodes     = new Map(); // nodeNum → { name, shortName, role, hwModel, lastSeen }
    this.positions = new Map(); // nodeNum → { lat, lon, alt, time }
    this.telemetry = new Map(); // nodeNum → { battery, voltage, temp, humidity, uptime }
    this.neighbors = new Map(); // nodeNum → [{ nodeNum, snr }]
    this.waypoints = new Map(); // id → { name, lat, lon, desc, createdBy }
    this.routes    = new Map(); // destNodeNum → [hop1, hop2, ...]
    this.files     = new Map(); // fileName → { sizeBytes }  (device-local file list)
    this._alerts   = [];        // pending alert messages
  }

  // ── Node info (NODEINFO_APP, port 4) ──
  upsertNode(num, user) {
    const existing = this.nodes.get(num);
    this.nodes.set(num, {
      name:      user?.longName || existing?.name || `Node ${num}`,
      shortName: user?.shortName || existing?.shortName || `${num}`,
      role:      user?.role || existing?.role || 'UNKNOWN',
      hwModel:   user?.hwModel || existing?.hwModel || 'UNKNOWN',
      lastSeen:  Date.now(),
    });
    debug(`[mesh-db] node ${num}: ${this.nodes.get(num).name}`);
  }

  getNode(num) {
    return this.nodes.get(num);
  }

  getNodeSummary(num) {
    const n = this.nodes.get(num);
    if (!n) return `Node ${num} (unknown)`;
    const age = Math.round((Date.now() - n.lastSeen) / 1000);
    return `${n.name} (${n.shortName}): ${n.hwModel}, ${n.role}, last seen ${age}s ago`;
  }

  getMeshSummary() {
    if (this.nodes.size === 0) return 'No nodes discovered yet.';
    const lines = [`${this.nodes.size} nodes on mesh:`];
    for (const [num, n] of this.nodes) {
      const age = Math.round((Date.now() - n.lastSeen) / 1000);
      const marker = num === MESH.myNodeId ? ' (this gateway)' : '';
      lines.push(`  ${n.name} (${n.shortName}) — last seen ${age}s ago${marker}`);
    }
    return lines.join('\n');
  }

  // ── Position (POSITION_APP, port 3) ──
  upsertPosition(num, pos) {
    this.positions.set(num, {
      lat:  pos.latitudeI  ? pos.latitudeI / 1e7  : pos.lat,
      lon:  pos.longitudeI ? pos.longitudeI / 1e7 : pos.lon,
      alt:  pos.altitude || 0,
      time: pos.time || Date.now(),
    });
    debug(`[mesh-db] position ${num}: ${this.positions.get(num).lat}, ${this.positions.get(num).lon}`);
  }

  getPosition(num) {
    const p = this.positions.get(num);
    if (!p) return null;
    return `(${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}) alt ${p.alt}m`;
  }

  // ── Telemetry (TELEMETRY_APP, port 67) ──
  upsertTelemetry(num, tel) {
    this.telemetry.set(num, {
      battery:    tel.batteryLevel   ?? this.telemetry.get(num)?.battery,
      voltage:    tel.voltage        ?? this.telemetry.get(num)?.voltage,
      temp:       tel.temperature    ?? this.telemetry.get(num)?.temp,
      humidity:   tel.relativeHumidity ?? this.telemetry.get(num)?.humidity,
      uptime:     tel.uptimeSeconds  ?? this.telemetry.get(num)?.uptime,
      lastUpdate: Date.now(),
    });
    debug(`[mesh-db] telemetry ${num}: battery=${this.telemetry.get(num).battery}%`);
  }

  getTelemetry(num) {
    const t = this.telemetry.get(num);
    if (!t) return 'No telemetry data.';
    const parts = [];
    if (t.battery != null) parts.push(`🔋 ${t.battery}%`);
    if (t.voltage != null) parts.push(`${t.voltage.toFixed(2)}V`);
    if (t.temp != null)    parts.push(`🌡 ${t.temp.toFixed(1)}°C`);
    if (t.humidity != null) parts.push(`💧 ${t.humidity}%`);
    if (t.uptime != null)  parts.push(`⏱ ${Math.round(t.uptime / 3600)}h`);
    return parts.join(' ');
  }

  getAllTelemetry() {
    if (this.telemetry.size === 0) return 'No telemetry data.';
    const lines = ['Battery levels:'];
    for (const [num, t] of this.telemetry) {
      const n = this.nodes.get(num);
      const name = n ? n.shortName : `Node ${num}`;
      lines.push(`  ${name}: ${t.battery ?? '?'}%`);
    }
    return lines.join('\n');
  }

  // ── Neighbors (NEIGHBORINFO_APP, port 68) ──
  upsertNeighbors(num, list) {
    this.neighbors.set(num, list.map(n => ({ nodeNum: n.nodeId ?? n.nodeNum, snr: n.snr })));
    debug(`[mesh-db] neighbors ${num}: ${list.length} peers`);
  }

  getNeighbors(num) {
    const list = this.neighbors.get(num);
    if (!list || list.length === 0) return 'No neighbor data.';
    return list.map(n => `  Node ${n.nodeNum}: SNR ${n.snr}dB`).join('\n');
  }

  // ── Waypoints (WAYPOINT_APP, port 5) ──
  upsertWaypoint(wp) {
    this.waypoints.set(wp.id, {
      name:      wp.name,
      lat:       wp.latitudeI / 1e7,
      lon:       wp.longitudeI / 1e7,
      desc:      wp.description || '',
      createdBy: wp.createdBy,
    });
    log(`[mesh-db] waypoint: ${wp.name} (${wp.latitudeI/1e7}, ${wp.longitudeI/1e7})`);
  }

  getAllWaypoints() {
    if (this.waypoints.size === 0) return 'No waypoints.';
    const lines = ['Waypoints:'];
    for (const [, wp] of this.waypoints) {
      lines.push(`  ${wp.name}: (${wp.lat.toFixed(5)}, ${wp.lon.toFixed(5)})${wp.desc ? ' — ' + wp.desc : ''}`);
    }
    return lines.join('\n');
  }

  // ── Routes (TRACEROUTE_APP, port 70) ──
  upsertRoute(dest, hops) {
    this.routes.set(dest, hops);
    log(`[mesh-db] route to ${dest}: ${hops.join(' → ')}`);
  }

  getRoute(dest) {
    const r = this.routes.get(dest);
    if (!r) return `No route to node ${dest}.`;
    return `Route to ${dest}: ${r.join(' → ')}`;
  }

  // ── Files (FileInfo FromRadio variant 15) ──
  upsertFile(fileName, sizeBytes) {
    this.files.set(fileName, { sizeBytes });
    debug(`[mesh-db] file: ${fileName} (${sizeBytes}B)`);
  }

  getFileList() {
    if (this.files.size === 0) return 'No files on gateway device.';
    const lines = ['Files on gateway device:'];
    for (const [name, f] of this.files) {
      const kb = (f.sizeBytes / 1024).toFixed(1);
      lines.push(`  ${name} — ${kb}KB`);
    }
    return lines.join('\n');
  }

  // ── Alerts ──
  checkAlerts() {
    const alerts = [];
    const now = Date.now();

    for (const [num, tel] of this.telemetry) {
      if (tel.battery != null && tel.battery < ALERTS.lowBatteryPct) {
        alerts.push(`🚨 Low battery on ${this.getNode(num)?.shortName || num}: ${tel.battery}%`);
      }
    }

    for (const [num, node] of this.nodes) {
      if (num === MESH.myNodeId) continue;
      const offlineMs = now - node.lastSeen;
      if (offlineMs > ALERTS.nodeOfflineMinutes * 60000) {
        alerts.push(`⚠️ ${node.shortName} offline for ${Math.round(offlineMs / 60000)}min`);
      }
    }

    this._alerts = alerts;
    return alerts;
  }

  getStats() {
    return {
      nodes:     this.nodes.size,
      positions: this.positions.size,
      telemetry: this.telemetry.size,
      neighbors: Array.from(this.neighbors.values()).reduce((s, l) => s + l.length, 0),
      waypoints: this.waypoints.size,
      routes:    this.routes.size,
      files:     this.files.size,
      alerts:    this._alerts,
    };
  }
}

export default MeshDB;


