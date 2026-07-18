/**
 * Daemon entry. Wires together identity, state, process
 * discovery, and lifecycle. The HTTP/WebSocket wire server ships
 * alongside the daemon skeleton so surfaces can read live state.
 */

import { acquirePidSlot, pidFilePath, releasePidSlot } from './lifecycle/pid-file.js';
import type { AgentMetadata, ProcessRow, ProcessType } from '@hookorama/client';
import { StateStore, type ProcessEntry, type Status } from './state/store.js';
import {
  pickDiscovery,
  type ProcessDiscovery,
  type ProcessRow as RawProcessRow,
} from './process-discovery/index.js';
import {
  normaliseCwd,
  resolveIdentity,
  type OpenTerminal,
  type ResolvedIdentity,
} from './identity/resolve.js';

export interface SupervisorOptions {
  readonly lifecycle?: { readonly customPidPath?: string };
  readonly discovery?: ProcessDiscovery | null;
  readonly now?: () => Date;
}

export class Supervisor {
  private readonly store = new StateStore();
  private readonly discovery: ProcessDiscovery | null;
  private readonly now: () => Date;
  private readonly pidFile: { path: string };
  private pidSlot: { acquired: true } | { acquired: false; existingPid: number } | null = null;
  private stopping = false;

  constructor(opts: SupervisorOptions = {}) {
    this.discovery =
      opts.discovery !== undefined ? opts.discovery : pickDiscovery(process.platform);
    this.now = opts.now ?? (() => new Date());
    this.pidFile = pidFilePath({
      product: 'hookorama-supervisor',
      ...(opts.lifecycle?.customPidPath !== undefined
        ? { customPath: opts.lifecycle.customPidPath }
        : {}),
    });
  }

  /** Open terminals reported by the extension. */
  openTerminals(): OpenTerminal[] {
    return Array.from(this.openTerminalsByPid.values());
  }
  private readonly openTerminalsByPid = new Map<number, OpenTerminal>();
  private processRowsCache: { readonly rows: readonly RawProcessRow[]; readonly at: number } | null = null;
  private readonly processRowsTtlMs = 1000;

  setOpenTerminals(terminals: readonly OpenTerminal[]): void {
    this.openTerminalsByPid.clear();
    for (const t of terminals) this.openTerminalsByPid.set(t.pid, t);
  }

  private inflightStart: Promise<boolean> | null = null;

  /** Acquire the PID slot. Returns false if another supervisor is alive. */
  async start(): Promise<boolean> {
    if (this.stopping) {
      this.stopping = false;
    }
    if (this.pidSlot?.acquired) return true;
    if (this.inflightStart !== null) return this.inflightStart;
    this.inflightStart = (async () => {
      try {
        this.pidSlot = await acquirePidSlot(this.pidFile, process.pid);
        if (!this.pidSlot.acquired) return false;
        try {
          await this.seedFromProcessDiscovery();
        } catch (err) {
          this.pidSlot = null;
          await releasePidSlot(this.pidFile);
          throw err;
        }
        if (this.stopping) {
          await releasePidSlot(this.pidFile);
          this.pidSlot = null;
          return false;
        }
        return true;
      } finally {
        this.inflightStart = null;
      }
    })();
    return this.inflightStart;
  }

  /** Release the PID slot and mark the supervisor as stopping. */
  async stop(): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;
    if (this.inflightStart !== null) {
      try {
        await this.inflightStart;
      } catch {
        // start() will have cleaned up; continue to release if needed
      }
    }
    if (!this.pidSlot?.acquired) {
      this.pidSlot = null;
      return;
    }
    try {
      await releasePidSlot(this.pidFile);
      this.pidSlot = null;
    } catch (err) {
      this.stopping = false;
      throw err;
    }
  }

  /** True after `stop()` has been called. */
  isStopping(): boolean {
    return this.stopping;
  }

  /**
   * Seed the live state from process discovery. The supervisor
   * does not record status from discovery alone — that arrives
   * via hook events. Discovery only provides the open terminal
   * list, which is the source of truth for `pid` resolution.
   */
  async seedFromProcessDiscovery(): Promise<void> {
    if (this.discovery === null) return;
    const rows = await this.discovery.list();
    this.ingestProcessTable(rows);
  }

  /**
   * Apply a hook event. Returns the resolved identity if the
   * event could be mapped to a known process.
   */
  async applyHook(input: {
    readonly pidChain?: readonly number[];
    readonly cwd?: string;
    readonly sessionId?: string;
    readonly agent?: string;
    readonly status: Status;
    readonly at?: string;
    readonly metadata?: AgentMetadata;
  }): Promise<ResolvedIdentity | null> {
    const knownPids = await this.knownPidsFromDiscovery();
    const identity = resolveIdentity(input.pidChain, input.cwd, this.openTerminals(), knownPids);
    if (identity === null) return null;
    this.store.applyEvent(identity, input.status, input.at ?? this.now().toISOString(), {
      ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
      ...(input.agent !== undefined ? { agent: input.agent } : {}),
      ...(input.pidChain !== undefined ? { pidChain: input.pidChain } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    });
    return identity;
  }

  private async fetchProcessRows(): Promise<readonly RawProcessRow[] | null> {
    if (this.discovery === null) return null;

    const now = this.now().getTime();
    if (this.processRowsCache !== null && now - this.processRowsCache.at < this.processRowsTtlMs) {
      return this.processRowsCache.rows;
    }

    try {
      const rows = await this.discovery.list();
      this.processRowsCache = { rows, at: now };
      return rows;
    } catch {
      return null;
    }
  }

  private async knownPidsFromDiscovery(): Promise<ReadonlySet<number>> {
    const rows = await this.fetchProcessRows();
    if (rows === null) return new Set();
    return new Set(rows.map((row) => row.pid));
  }

  /**
   * `parentKey → toolUseId → actualKey[]` index. The state store
   * remints colliding keys when two subagents share a toolUseId
   * in the same millisecond; this lets `endSubagent(toolUseId)`
   * close every actual key written by `startSubagent(toolUseId)`
   * even after one or more collisions.
   */
  private readonly subagentKeysByToolUseId = new Map<string, Map<string, string[]>>();

  private rememberSubagentKey(parentKey: string, toolUseId: string, actualKey: string): void {
    let perParent = this.subagentKeysByToolUseId.get(parentKey);
    if (perParent === undefined) {
      perParent = new Map();
      this.subagentKeysByToolUseId.set(parentKey, perParent);
    }
    const existing = perParent.get(toolUseId) ?? [];
    if (!existing.includes(actualKey)) existing.push(actualKey);
    perParent.set(toolUseId, existing);
  }

  startSubagent(identity: ResolvedIdentity, at: string, toolUseId?: string): string {
    const desired =
      toolUseId !== undefined
        ? `${identity.key}:subagent:${toolUseId}`
        : `${identity.key}:subagent:${at}`;
    const actualKey = this.store.upsertSubagent(identity.key, desired, at);
    if (toolUseId !== undefined) {
      this.rememberSubagentKey(identity.key, toolUseId, actualKey);
    }
    return actualKey;
  }

  endSubagent(
    parentKey: string,
    at: string,
    toolUseId?: string,
  ): { closedByKey: boolean; closedByParent: boolean } {
    if (toolUseId !== undefined) {
      const perParent = this.subagentKeysByToolUseId.get(parentKey);
      const rememberedKeys = perParent?.get(toolUseId) ?? [];
      const fallback = `${parentKey}:subagent:${toolUseId}`;
      const candidateKeys: string[] = [...rememberedKeys];
      if (!candidateKeys.includes(fallback)) candidateKeys.push(fallback);
      for (const candidate of candidateKeys) {
        if (this.store.closeSubagentByKey(candidate, at)) {
          const remaining = rememberedKeys.filter((k) => k !== candidate);
          if (remaining.length === 0) {
            perParent?.delete(toolUseId);
          } else {
            perParent?.set(toolUseId, remaining);
          }
          return { closedByKey: true, closedByParent: false };
        }
      }
    }
    const closed = this.store.closeSubagentOf(parentKey, at);
    return { closedByKey: false, closedByParent: closed };
  }

  /** Snapshot for surfaces (read‑only). */
  snapshot(): readonly ProcessEntry[] {
    return this.store.snapshot();
  }

  /** OS process tree annotated with the agents that own each process. */
  async processes(): Promise<ProcessRow[]> {
    const rows = await this.fetchProcessRows();
    if (rows === null) return [];
    const entries = this.store.snapshot();

    const pidToAgent = new Map<number, { agentId: string; projectId?: string | undefined }>();
    for (const entry of entries) {
      if (entry.pid !== undefined) {
        const projectId = entry.metadata?.projectId;
        pidToAgent.set(
          entry.pid,
          projectId === undefined ? { agentId: entry.key } : { agentId: entry.key, projectId },
        );
      }
    }

    let changed = true;
    while (changed) {
      changed = false;
      for (const row of rows) {
        if (pidToAgent.has(row.pid)) continue;
        const parent = pidToAgent.get(row.ppid);
        if (parent !== undefined) {
          pidToAgent.set(row.pid, parent);
          changed = true;
        }
      }
    }

    return rows.map((row) => {
      const mapped = pidToAgent.get(row.pid);
      const cmdLower = row.command.toLowerCase();
      const type: ProcessType = mapped
        ? 'agent'
        : cmdLower.includes('code') || cmdLower.includes('cursor')
          ? 'ide'
          : 'system';
      const result: Record<string, unknown> = {
        pid: row.pid,
        ppid: row.ppid,
        cmd: row.command,
        user: row.user ?? '?',
        startedAt: row.startedAt ?? 0,
        type,
      };
      if (row.tty !== undefined) {
        result['tty'] = row.tty;
      }
      if (mapped !== undefined) {
        result['agentId'] = mapped.agentId;
        if (mapped.projectId !== undefined) {
          result['projectId'] = mapped.projectId;
        }
      }
      return result as unknown as ProcessRow;
    });
  }

  private ingestProcessTable(rows: readonly RawProcessRow[]): void {
    // Process discovery does not contribute to live status; it
    // only feeds a future cwd-only fallback when the extension
    // is unavailable. The supervisor relies on the extension for
    // authoritative pid→terminal mapping. We retain the rows in
    // a side table so a future fallback (cwd-only when extension
    // is absent) can resolve a pid chain to a name. PR 3 wires
    // it into the wire protocol.
    this.store.seedFromDiscovery(rows);
  }

  /** Normalise cwd — re‑exported so callers don't import identity directly. */
  static normaliseCwd = normaliseCwd;
}

/** Convenience for the daemon entry script and tests. */
export const SupervisorProcess = Supervisor;
