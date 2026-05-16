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
