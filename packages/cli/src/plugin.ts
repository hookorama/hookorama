/**
 * Agent plugin surface for `hookorama`.
 *
 * Each supported agent (Claude, Devin, …) implements this interface. The CLI
 * delegates hook parsing, install, update, remove, and status checks to the
 * plugin so that agent-specific config formats stay isolated.
 */

import type { HookRequest } from '@hookorama/client';

export interface AgentPluginOptions {
  /** When true, do not write files; only report what would change. */
  readonly dryRun?: boolean;
}

export interface AgentPluginStatus {
  readonly installed: boolean;
  readonly path: string;
}

export interface AgentPlugin {
  /** Plugin name, e.g. `claude` or `devin`. */
  readonly name: string;

  /** Short description shown in `hookorama plugin list`. */
  readonly description: string;

  /**
   * Build a `HookRequest` from the raw CLI tokens.
   *
   * `status` is validated by the CLI before this is called. `args` contains
   * the tokens after `hook <agent> <status>`.
   */
  buildHookRequest(agent: string, status: string, args: string[]): HookRequest;

  /** Install the agent hook configuration. */
  install(opts?: AgentPluginOptions): Promise<void>;

  /** Update the agent hook configuration. */
  update(opts?: AgentPluginOptions): Promise<void>;

  /** Remove the agent hook configuration. */
  remove(opts?: AgentPluginOptions): Promise<void>;

  /** Optional: report whether the plugin config is installed. */
  status?(): Promise<AgentPluginStatus>;
}
