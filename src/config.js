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
  // Model: auto-detected from models.json in agentDir by default.
  //   Override with PI_AGENT_MODEL and PI_AGENT_PROVIDER env vars.
  //   e.g. PI_AGENT_PROVIDER=local-llm-3 PI_AGENT_MODEL=Qwen3.6-35B-A3B-APEX-I-Balanced.gguf
  // No hardcoded paths — works on any machine without changes.
  model:    process.env.PI_AGENT_MODEL    || null,  // null = auto-detect from settings.json
  provider: process.env.PI_AGENT_PROVIDER || null,  // null = auto-detect from settings.json
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
