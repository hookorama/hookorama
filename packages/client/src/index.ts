/**
 * `@hookorama/client` — public barrel.
 *
 * Owns the wire-protocol types and the isomorphic supervisor client.
 */

export * from './types.js';
export { SupervisorClient } from './client.js';
export type { SupervisorClientOptions } from './client.js';
