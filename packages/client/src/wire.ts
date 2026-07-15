/**
 * Wire-protocol types shared between the supervisor and every surface.
 *
 * These shapes are intentionally isomorphic: they use only global
 * constructors (WebSocket, fetch, URL, crypto) and plain JSON so the
 * same client works in Node, Bun, and the browser.
 */

/** Six discrete states, lifted from the supervisor's live state map. */
export type Status =
  | 'idle'
  | 'thinking'
  | 'running-tool'
  | 'waiting-input'
  | 'done'
  | 'error';

/**
 * A row in the supervisor's live state map. The `agent` field is the
 * human-readable agent name; richer metadata lives in `AgentMetadata`.
 */
export interface ProcessEntry {
  readonly key: string;
  readonly status: Status;
  readonly at: string;
  readonly cwd: string;
  readonly sessionId?: string;
  readonly agent?: string;
  readonly pid?: number;
  readonly pidChain?: readonly number[];
  readonly parentKey?: string;
  readonly terminalName?: string;
}

/** Rich, optional metadata about an agent that does not affect identity. */
export interface AgentMetadata {
  readonly type?: 'agent' | 'subagent' | 'tool';
  readonly origin?: 'terminal' | 'vscode' | 'jetbrains' | 'ci';
  readonly projectId?: string;
  readonly model?: string;
  readonly skill?: string;
  readonly currentTask?: string;
  readonly waitingReason?: string;
}

/** A hook sent by an agent or surface to the supervisor. */
export interface HookRequest {
  readonly pidChain?: readonly number[];
  readonly cwd?: string;
  readonly sessionId?: string;
  readonly agent?: string;
  readonly status: Status;
  readonly metadata?: AgentMetadata;
}

/** A history/broadcast event emitted by the supervisor. */
export interface HookEvent {
  readonly id: string;
  readonly at: string;
  readonly key: string;
  readonly status?: Status;
  readonly pid?: number;
  readonly pidChain?: readonly number[];
  readonly cwd?: string;
  readonly sessionId?: string;
  readonly agent?: string;
  readonly metadata?: AgentMetadata;
  readonly type?: string;
  readonly summary?: string;
  readonly payload?: unknown;
}

/** Full live-state snapshot broadcast on connect and on demand. */
export interface WireSnapshot {
  readonly kind: 'snapshot';
  readonly at: string;
  readonly entries: readonly ProcessEntry[];
  readonly agents?: Readonly<Record<string, AgentMetadata>>;
}

/** Acknowledgement that a `WireHook` was persisted. */
export interface WireAck {
  readonly kind: 'ack';
  readonly id: string;
}

/** A `HookEvent` wrapped for the wire. */
export interface WireEvent {
  readonly kind: 'event';
  readonly event: HookEvent;
}

/** A `HookRequest` wrapped with a client id and sent over the wire. */
export interface WireHook extends HookRequest {
  readonly kind: 'hook';
  readonly id: string;
}

/** Supervisor-side error with an optional client request id. */
export interface WireError {
  readonly kind: 'error';
  readonly message: string;
  readonly id?: string;
}

/** Union of every message that can cross the wire. */
export type WireMessage = WireSnapshot | WireAck | WireEvent | WireHook | WireError;
