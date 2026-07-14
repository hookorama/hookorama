/**
 * Daemon entry. Wires together identity, state, process
 * discovery, and lifecycle. The full NDJSON socket and HTTP/WS
 * servers ship in PR 3 (wire protocol); PR 2 ships the daemon
 * skeleton so the lifecycle and PID‑file behaviour are
 * exercised by CI.
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

  /** Test‑only constructor that bypasses `process.platform` discovery. */

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

  /** Acquire the PID slot. Returns false if another supervisor is alive. */
  async start(): Promise<boolean> {
    this.pidSlot = await acquirePidSlot(this.pidFile, process.pid);
    if (!this.pidSlot.acquired) return false;
    await this.seedFromProcessDiscovery();
    return true;
  }

  /** Release the PID slot and mark the supervisor as stopping. */
  async stop(): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;
    if (this.pidSlot?.acquired) await releasePidSlot(this.pidFile);
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
    const identity = resolveIdentity(
      input.pidChain,
      input.cwd,
      this.openTerminals(),
      knownPids,
    );
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

  startSubagent(identity: ResolvedIdentity, at: string, toolUseId?: string): string {
    const childKey = toolUseId !== undefined
      ? `${identity.key}:subagent:${toolUseId}`
      : `${identity.key}:subagent:${at}`;
    this.store.upsertSubagent(identity.key, childKey, at);
    return childKey;
  }

  endSubagent(
    parentKey: string,
    at: string,
    toolUseId?: string,
  ): { closedByKey: boolean; closedByParent: boolean } {
    if (toolUseId !== undefined) {
      const childKey = `${parentKey}:subagent:${toolUseId}`;
      const closed = this.store.closeSubagentByKey(childKey, at);
      if (closed) return { closedByKey: true, closedByParent: false };
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
        pidToAgent.set(entry.pid, projectId === undefined ? { agentId: entry.key } : { agentId: entry.key, projectId });
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
      const result: ProcessRow = {
        pid: row.pid,
        ppid: row.ppid,
        cmd: row.command,
        user: row.user ?? '?',
        startedAt: row.startedAt,
        type,
        ...(row.tty !== undefined ? { tty: row.tty } : {}),
        ...(mapped?.agentId !== undefined ? { agentId: mapped.agentId } : {}),
        ...(mapped?.projectId !== undefined ? { projectId: mapped.projectId } : {}),
      };
      return result;
    });
  }

  private ingestProcessTable(rows: readonly RawProcessRow[]): void {
    // Process discovery does not contribute to live status;
    // it only feeds the open‑terminal table when the extension
    // is unavailable. The supervisor relies on the extension for
    // authoritative pid→terminal mapping. We keep the rows around
    // only so a future fallback (cwd‑only when extension is
    // absent) can resolve a pid chain to a name. For PR 2 we
    // simply retain the data without surfacing it; PR 3 wires it
    // into the wire protocol.
    void rows;
  }

  /** Normalise cwd — re‑exported so callers don't import identity directly. */
  static normaliseCwd = normaliseCwd;
}

/** Convenience for the daemon entry script and tests. */
export const SupervisorProcess = Supervisor;