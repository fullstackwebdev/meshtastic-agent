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
