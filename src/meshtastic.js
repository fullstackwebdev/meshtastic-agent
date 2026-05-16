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
