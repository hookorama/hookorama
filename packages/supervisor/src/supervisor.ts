/**
 * Daemon entry. Wires together identity, state, process
 * discovery, and lifecycle. The full NDJSON socket and HTTP/WS
 * servers ship in PR 3 (wire protocol); PR 2 ships the daemon
 * skeleton so the lifecycle and PID‑file behaviour are
 * exercised by CI.
 */

import { acquirePidSlot, pidFilePath, releasePidSlot } from './lifecycle/pid-file.js';
import { StateStore, type ProcessEntry, type Status } from './state/store.js';
import {
  pickDiscovery,
  type ProcessDiscovery,
  type ProcessRow,
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

  setOpenTerminals(terminals: readonly OpenTerminal[]): void {
    this.openTerminalsByPid.clear();
    for (const t of terminals) this.openTerminalsByPid.set(t.pid, t);
  }

  /** Acquire the PID slot. Returns false if another supervisor is alive. */
  async start(): Promise<boolean> {
    this.pidSlot = await acquirePidSlot(this.pidFile, process.pid);
    if (!this.pidSlot.acquired) return false;
    try {
      await this.seedFromProcessDiscovery();
    } catch (err) {
      this.pidSlot = null;
      await releasePidSlot(this.pidFile);
      throw err;
    }
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
  applyHook(input: {
    readonly pidChain?: readonly number[];
    readonly cwd?: string;
    readonly sessionId?: string;
    readonly agent?: string;
    readonly status: Status;
  }): ResolvedIdentity | null {
    const identity = resolveIdentity(input.pidChain, input.cwd, this.openTerminals());
    if (identity === null) return null;
    this.store.applyEvent(identity, input.status, this.now().toISOString(), {
      ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
      ...(input.agent !== undefined ? { agent: input.agent } : {}),
      ...(input.pidChain !== undefined ? { pidChain: input.pidChain } : {}),
    });
    return identity;
  }

  /**
   * `parentKey → toolUseId → actualKey` index. The state store
   * remints colliding keys; this lets `endSubagent(toolUseId)`
   * close the actual key written by `startSubagent(toolUseId)`
   * even after a collision.
   */
  private readonly subagentKeysByToolUseId = new Map<string, Map<string, string>>();

  private rememberSubagentKey(parentKey: string, toolUseId: string, actualKey: string): void {
    let perParent = this.subagentKeysByToolUseId.get(parentKey);
    if (perParent === undefined) {
      perParent = new Map();
      this.subagentKeysByToolUseId.set(parentKey, perParent);
    }
    perParent.set(toolUseId, actualKey);
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
      const rememberedKey = perParent?.get(toolUseId);
      const candidateKeys =
        rememberedKey !== undefined
          ? [rememberedKey, `${parentKey}:subagent:${toolUseId}`]
          : [`${parentKey}:subagent:${toolUseId}`];
      for (const candidate of candidateKeys) {
        if (this.store.closeSubagentByKey(candidate, at)) {
          if (perParent !== undefined) perParent.delete(toolUseId);
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

  private ingestProcessTable(rows: readonly ProcessRow[]): void {
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
