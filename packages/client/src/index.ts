/**
 * `@hookorama/client` — public barrel.
 *
 * Isomorphic wire-protocol types and the WebSocket/HTTP client used by
 * every surface (CLI, dashboard, VS Code extension) to talk to the
 * supervisor.
 */

export type {
  Status,
  ProcessEntry,
  AgentMetadata,
  HookRequest,
  HookEvent,
  WireSnapshot,
  WireAck,
  WireEvent,
  WireHook,
  WireError,
  WireMessage,
} from './wire.js';
export { SupervisorClient, type SupervisorClientOptions } from './supervisor-client.js';
