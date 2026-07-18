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

async function writeConfig(config: DevinConfig): Promise<void> {
  await mkdir(dirname(configPath), { recursive: true });
  const tempPath = `${configPath}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  await rename(tempPath, configPath);
}

function mergeHooks(existing: DevinHooks | undefined, generated: DevinHooks): DevinHooks {
  const merged = new Map<string, readonly DevinHookEntry[]>(Object.entries(existing ?? {}));
  const generatedMap = new Map<string, readonly DevinHookEntry[]>(Object.entries(generated));
  for (const event of HOOK_EVENTS) {
    const existingEntries = merged.get(event) ?? [];
    const cleaned = existingEntries
      .map((entry) => Object.assign({}, entry, { hooks: entry.hooks.filter((h) => !isHookoramaCommand(h.command)) }))
      .filter((entry) => entry.hooks.length > 0);
    merged.set(event, [...cleaned, ...(generatedMap.get(event) ?? [])]);
  }
  return Object.fromEntries(merged) as DevinHooks;
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
  description: 'Devin CLI — writes .devin/config.json hooks in the current project',

  buildHookRequest(agent: string, status: Status, args: readonly string[]): HookRequest {
    return buildCommonHookRequest(agent, status, args, process.env['DEVIN_PROJECT_DIR']);
  },

  async install(opts: AgentPluginOptions = {}): Promise<void> {
    const config = await readConfig();
    const newHooks = buildHooks();
    const hooks = mergeHooks(config.hooks, newHooks);

    const next = { ...config, hooks };
    if (opts.dryRun) {
      console.warn('[dry-run] would install Devin hooks to %s', configPath);
      console.warn(JSON.stringify(next, null, 2));
      return;
    }
    await writeConfig(next);
    console.warn('Devin hooks installed to %s', configPath);
  },

  async update(opts: AgentPluginOptions = {}): Promise<void> {
    const config = await readConfig();
    if (config.hooks === undefined) {
      console.warn('Devin hooks not installed');
      return;
    }
    const newHooks = buildHooks();
    const hooks = mergeHooks(config.hooks, newHooks);

    const next = { ...config, hooks };
    if (opts.dryRun) {
      console.warn('[dry-run] would update Devin hooks in %s', configPath);
      console.warn(JSON.stringify(next, null, 2));
      return;
    }
    await writeConfig(next);
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

    if (opts.dryRun) {
      console.warn('[dry-run] would remove Devin hooks from %s', configPath);
      console.warn(JSON.stringify(next, null, 2));
      return;
    }
    await writeConfig(next);
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
