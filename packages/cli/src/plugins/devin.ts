/**
 * Devin plugin for `hookorama`.
 *
 * Writes a `hooks` block to `.devin/config.json` in the current project that
 * dispatches `hookorama hook devin <status>` at Devin CLI lifecycle events.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { HookRequest, Status } from '@hookorama/client';
import type { AgentPlugin, AgentPluginOptions, AgentPluginStatus } from '../plugin.js';
import { buildCommonHookRequest } from './shared/hook-args.js';
import { getSelfCommandString } from '../util/self-command.js';

const HOOK_EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PermissionRequest',
  'Stop',
  'SessionEnd',
] as const;

type DevinHookEvent = (typeof HOOK_EVENTS)[number];

const EVENT_TO_STATUS: ReadonlyMap<DevinHookEvent, string> = new Map([
  ['SessionStart', 'thinking'],
  ['UserPromptSubmit', 'thinking'],
  ['PreToolUse', 'running-tool'],
  ['PostToolUse', 'thinking'],
  ['PermissionRequest', 'waiting-input'],
  ['Stop', 'done'],
  ['SessionEnd', 'done'],
] as const);

// Devin project config is .devin/config.json in the current project root.
const configPath = join(process.cwd(), '.devin', 'config.json');

interface DevinHookCommand {
  readonly type: 'command';
  readonly command: string;
  readonly timeout?: number;
}

interface DevinHookEntry {
  readonly matcher?: string;
  readonly hooks: readonly DevinHookCommand[];
}

type DevinHooks = Record<string, readonly DevinHookEntry[]>;

interface DevinConfig {
  hooks?: DevinHooks;
}

function buildCommand(status: string): string {
  const self = getSelfCommandString();
  return `${self} hook devin ${status}`;
}

function buildHooks(): DevinHooks {
  return Object.fromEntries(
    HOOK_EVENTS.map((event) => {
      const status = EVENT_TO_STATUS.get(event);
      if (status === undefined) {
        throw new Error(`unknown hook event: ${event}`);
      }
      return [event, [{ matcher: '', hooks: [{ type: 'command', command: buildCommand(status) }] }]] as const;
    }),
  ) as DevinHooks;
}

async function readConfig(): Promise<DevinConfig> {
  if (!existsSync(configPath)) {
    return {};
  }
  const raw = await readFile(configPath, 'utf8');
  try {
    return JSON.parse(raw) as DevinConfig;
  } catch {
    throw new Error(`invalid JSON in ${configPath}`);
  }
}

async function writeConfig(config: DevinConfig, dryRun?: boolean): Promise<void> {
  if (dryRun) {
    console.warn('[dry-run] would write %s', configPath);
    console.warn(JSON.stringify(config, null, 2));
    return;
  }
  await mkdir(dirname(configPath), { recursive: true });
  const tempPath = `${configPath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  await rename(tempPath, configPath);
}

function mergeHooks(existing: DevinHooks | undefined, generated: DevinHooks): DevinHooks {
  const merged: DevinHooks = { ...existing };
  for (const [event, generatedEntries] of Object.entries(generated)) {
    const existingEntries = merged[event] ?? [];
    const cleaned = existingEntries
      .map((entry) => Object.assign({}, entry, { hooks: entry.hooks.filter((h) => !isHookoramaCommand(h.command)) }))
      .filter((entry) => entry.hooks.length > 0);
    merged[event] = [...cleaned, ...generatedEntries];
  }
  return merged;
}

function isHookoramaCommand(command: string): boolean {
  for (const status of EVENT_TO_STATUS.values()) {
    if (command === buildCommand(status)) {
      return true;
    }
  }
  return false;
}

export const devinPlugin: AgentPlugin = {
  name: 'devin',
  description: 'Devin CLI — writes ~/.config/devin/config.json hooks',

  buildHookRequest(agent: string, status: Status, args: readonly string[]): HookRequest {
    return buildCommonHookRequest(agent, status, args, process.env['DEVIN_PROJECT_DIR']);
  },

  async install(opts: AgentPluginOptions = {}): Promise<void> {
    const config = await readConfig();
    const newHooks = buildHooks();
    const hooks = mergeHooks(config.hooks, newHooks);

    await writeConfig({ ...config, hooks }, opts.dryRun);
    console.warn('Devin hooks installed to %s', configPath);
  },

  async update(opts: AgentPluginOptions = {}): Promise<void> {
    await this.install(opts);
    console.warn('Devin hooks updated');
  },

  async remove(opts: AgentPluginOptions = {}): Promise<void> {
    const config = await readConfig();
    if (config.hooks === undefined) {
      console.warn('Devin hooks not installed');
      return;
    }

    const remainingEntries = Object.entries(config.hooks)
      .map(([event, entries]) => {
        const filtered = entries
          .map((entry) => ({ ...entry, hooks: entry.hooks.filter((h) => !isHookoramaCommand(h.command)) }))
          .filter((entry) => entry.hooks.length > 0);
        return [event, filtered] as const;
      })
      .filter(([, filtered]) => filtered.length > 0);
    const remaining = Object.fromEntries(remainingEntries) as DevinHooks;

    const next: DevinConfig = { ...config };
    if (Object.keys(remaining).length > 0) {
      next.hooks = remaining;
    } else {
      delete next.hooks;
    }

    await writeConfig(next, opts.dryRun);
    console.warn('Devin hooks removed from %s', configPath);
  },

  async status(): Promise<AgentPluginStatus> {
    const installed = existsSync(configPath);
    const config = installed ? await readConfig() : {};
    const hasHookorama =
      config.hooks !== undefined &&
      Object.values(config.hooks).some((entries) =>
        entries.some((entry) => entry.hooks.some((h) => isHookoramaCommand(h.command))),
      );
    return { installed: hasHookorama, path: configPath };
  },
};
