/**
 * Wire protocol types for Hookorama.
 *
 * These types are shared between the supervisor, every surface, and any
 * external consumer that wants to talk to the supervisor.
 */

/** Six discrete agent states. */
export type Status =
  | 'idle'
  | 'thinking'
  | 'running-tool'
  | 'waiting-input'
  | 'done'
  | 'error';

/** Cost and task counters supplied by an agent through hook metadata. */
export interface AgentMetrics {
  readonly tasks: number;
  readonly toolCalls: number;
  readonly cost: number;
  readonly errors: number;
}

/** Optional dashboard-enrichment supplied by an agent hook. */
export interface AgentMetadata {
  readonly model?: string;
  readonly skill?: string;
  readonly currentTask?: string;
  readonly waitingReason?: string;
  readonly lastErrorAt?: string;
  readonly metrics?: AgentMetrics;
  readonly projectId?: string;
  readonly origin?: string;
}

/** One row in the supervisor's live state table. */
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
  readonly metadata?: AgentMetadata;
}

/** A normalized event that the supervisor broadcasts to consumers. */
export interface HookEvent {
  readonly id: string;
  readonly ts: number;
  /** The process key this event belongs to (e.g. `pid:1234`). */
  readonly key?: string;
  readonly agent?: string;
  readonly projectId?: string;
  readonly sessionId?: string;
  readonly pid?: number;
  readonly type: string;
  readonly summary: string;
  readonly payload?: Record<string, unknown>;
}

/** Full live state snapshot returned by GET /api/state. */
export interface WireSnapshot {
  readonly entries: readonly ProcessEntry[];
  readonly at: string;
}

/** OS process classification used by GET /api/processes. */
export type ProcessType = 'agent' | 'tool' | 'ide' | 'system';

/** One row in the OS process table returned by GET /api/processes. */
export interface ProcessRow {
  readonly pid: number;
  readonly ppid: number;
  readonly cmd: string;
  readonly user: string;
  readonly tty?: string;
  readonly startedAt: number;
  readonly type: ProcessType;
  readonly agentId?: string;
  readonly projectId?: string;
}

/** Messages pushed over the WebSocket / from the supervisor to clients. */
export type WireMessage =
  | { readonly type: 'snapshot'; readonly data: WireSnapshot }
  | { readonly type: 'event'; readonly data: HookEvent }
  | { readonly type: 'ack'; readonly id: string };

/** Request body accepted by POST /api/hook. */
export interface HookRequest {
  readonly pidChain?: readonly number[];
  readonly cwd?: string;
  readonly sessionId?: string;
  readonly agent?: string;
  readonly status: Status;
  readonly at?: string;
  readonly metadata?: AgentMetadata;
}
