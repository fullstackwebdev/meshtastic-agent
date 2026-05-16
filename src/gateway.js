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
