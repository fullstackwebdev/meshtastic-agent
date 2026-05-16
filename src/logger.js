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
