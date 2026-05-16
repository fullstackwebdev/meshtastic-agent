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
