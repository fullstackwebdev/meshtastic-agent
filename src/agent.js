/**
 * agent.js — Meshtastic Agent V4
 * 
 * Per-node PI Agent session manager. Uses the PI Agent SDK
 * (createAgentSession) for persistent sessions with streaming token output.
 * Registers mesh-aware tools so the LLM can query live mesh state:
 *   mesh_who, mesh_battery, mesh_where, mesh_neighbors,
 *   mesh_stats, mesh_send, mesh_locate, mesh_files
 */

import { createAgentSession, defineTool, getAgentDir, AuthStorage, ModelRegistry } from '@earendil-works/pi-coding-agent';
import { Type } from '@earendil-works/pi-ai';
import { CHUNK, PI_AGENT } from './config.js';
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

    // Set up auth + model registry for agent sessions
    this.authStorage   = AuthStorage.create();
    this.modelRegistry = ModelRegistry.create(this.authStorage);

    // ── List all known models (from models.json) ──
    this._listAllModels();

    // Resolve configured model (null = auto-detect from settings.json)
    log(`[agent] PI_AGENT.provider=${PI_AGENT.provider || '(unset)'}  PI_AGENT.model=${PI_AGENT.model || '(unset)'}`);
    if (PI_AGENT.provider && PI_AGENT.model) {
      this.configuredModel = this.modelRegistry.find(PI_AGENT.provider, PI_AGENT.model);
      if (!this.configuredModel) {
        throw new Error(`Model not found: ${PI_AGENT.provider}/${PI_AGENT.model}`);
      }
      log(`[agent] model configured: ${PI_AGENT.provider}/${PI_AGENT.model}`);
      log(`[agent]   name: ${this.configuredModel.name}`);
      log(`[agent]   ctx: ${this.configuredModel.contextWindow}  maxOut: ${this.configuredModel.maxTokens}  reasoning: ${this.configuredModel.reasoning}`);
      // Explicit model → don't continue old sessions (they'd restore a different model)
      this.continueSessions = false;
    } else {
      this.configuredModel = null;
      this.continueSessions = true;
      log(`[agent] model: auto-detect from settings.json (defaultModel)`);
    }
  }

  _listAllModels() {
    log(`[agent] ── models in registry ──`);
    const all = this.modelRegistry.getAll();
    if (all.length === 0) {
      log(`[agent]   (none found)`);
    } else {
      for (const m of all) {
        const cfg = m.provider === PI_AGENT.provider && m.id === PI_AGENT.model ? ' ★CONFIGURED' : '';
        log(`[agent]   ${m.provider}/${m.id}  («${m.name}» ctx=${m.contextWindow} reasoning=${m.reasoning})${cfg}`);
      }
    }
    log(`[agent] ─────────────────────────`);
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
      continueSession: this.continueSessions,
      customTools: this.buildMeshTools(),
      authStorage: this.authStorage,
      modelRegistry: this.modelRegistry,
      // model: null = auto-detect from settings.json; configured via PI_AGENT_MODEL env
      ...(this.configuredModel ? { model: this.configuredModel } : {}),
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
