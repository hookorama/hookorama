/**
 * Live state store: a `Map<ProcessKey, ProcessEntry>` plus the
 * subagent handling described in ADR 0001.
 *
 * The map is rebuilt from process discovery on every supervisor
 * startup, then mutated by incoming hook events. The store is
 * the **only writer** of its own data; surfaces read it through
 * the wire protocol.
 */

import type { ResolvedIdentity } from '../identity/resolve.js';

/** Six discrete states, lifted from the v1 predecessor. */
export type Status = 'idle' | 'thinking' | 'running-tool' | 'waiting-input' | 'done' | 'error';

/**
 * A row in the live state map. `parentKey` is set only for
 * virtual subagent nodes (ADR 0001 §"Subagent handling"); a
 * subagent shares its parent's `pid`, so pid‑chain nesting
 * cannot distinguish them.
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

export class StateStore {
  private readonly entries = new Map<string, ProcessEntry>();
  private readonly subagentCounters = new Map<string, number>();

  /** Total entry count, including virtual subagent nodes. */
  size(): number {
    return this.entries.size;
  }

  /** All entries, including subagents. */
  snapshot(): ProcessEntry[] {
    return Array.from(this.entries.values());
  }

  /** Top‑level entries only (entries without a `parentKey`). */
  liveEntries(): ProcessEntry[] {
    return this.snapshot().filter((e) => e.parentKey === undefined);
  }

  get(key: string): ProcessEntry | undefined {
    return this.entries.get(key);
  }

  /**
   * Upsert a process entry. Pass `parentKey` only for subagent
   * children. Returns the previous entry at the same key, if any.
   */
  upsert(entry: ProcessEntry): ProcessEntry | undefined {
    const prev = this.entries.get(entry.key);
    this.entries.set(entry.key, entry);
    return prev;
  }

  /**
   * Upsert a virtual subagent child. The child shares the
   * parent's identity but is nested under it in the tree.
   *
   * If the supplied `childKey` already exists we mint a unique
   * suffix from a per‑parent counter so two subagents opened at
   * the same timestamp (or without a `toolUseId`) cannot collide.
   */
  upsertSubagent(parentKey: string, childKey: string, at: string): string {
    const parent = this.entries.get(parentKey);
    if (parent === undefined) {
      throw new Error(`upsertSubagent: unknown parent ${parentKey}`);
    }
    let finalKey = childKey;
    if (this.entries.has(finalKey)) {
      const counter = (this.subagentCounters.get(parentKey) ?? 0) + 1;
      this.subagentCounters.set(parentKey, counter);
      finalKey = `${childKey}#${counter}`;
    }
    const child: ProcessEntry = {
      key: finalKey,
      status: 'running-tool',
      at,
      cwd: parent.cwd,
      parentKey,
      ...(parent.agent !== undefined ? { agent: parent.agent } : {}),
      ...(parent.pid !== undefined ? { pid: parent.pid } : {}),
      ...(parent.pidChain !== undefined ? { pidChain: parent.pidChain } : {}),
    };
    this.entries.set(finalKey, child);
    return finalKey;
  }

  /**
   * Close a subagent child by exact key (preferred) or by
   * best‑effort ("most recent non‑done child of the same parent").
   */
  closeSubagentByKey(childKey: string, at: string): boolean {
    const entry = this.entries.get(childKey);
    if (entry === undefined || entry.parentKey === undefined) return false;
    this.entries.set(childKey, { ...entry, status: 'done', at });
    return true;
  }

  closeSubagentOf(parentKey: string, at: string): boolean {
    const sortedChildren = Array.from(this.entries.values())
      .filter((e) => e.parentKey === parentKey && e.status !== 'done' && e.status !== 'error')
      .sort((a, b) => (a.at < b.at ? 1 : -1));
    const first = sortedChildren.at(0);
    if (first === undefined) {
      return false;
    }
    const target: ProcessEntry = first;
    this.entries.set(target.key, { ...target, status: 'done', at });
    return true;
  }

  /** Drop every subagent of a parent. Used on `session_start`. */
  clearSubagentChildren(parentKey: string): number {
    let dropped = 0;
    for (const [key, entry] of Array.from(this.entries.entries())) {
      if (entry.parentKey === parentKey) {
        this.entries.delete(key);
        dropped += 1;
      }
    }
    return dropped;
  }

  /** Resolve identity for an incoming event and upsert the entry. */
  applyEvent(
    identity: ResolvedIdentity | null,
    status: Status,
    at: string,
    enrich: {
      readonly sessionId?: string;
      readonly agent?: string;
      readonly pidChain?: readonly number[];
      readonly terminalName?: string;
    },
  ): ProcessEntry | undefined {
    if (identity === null) return undefined;
    const prev = this.entries.get(identity.key);
    const next: ProcessEntry = {
      key: identity.key,
      status,
      at,
      cwd: identity.cwd,
      ...(identity.pid !== undefined ? { pid: identity.pid } : {}),
      ...(enrich.sessionId !== undefined ? { sessionId: enrich.sessionId } : {}),
      ...(enrich.agent !== undefined ? { agent: enrich.agent } : {}),
      ...(enrich.pidChain !== undefined ? { pidChain: enrich.pidChain } : {}),
      ...(enrich.terminalName !== undefined ? { terminalName: enrich.terminalName } : {}),
    };
    this.entries.set(identity.key, next);
    return prev;
  }
}
