/**
 * Devin plugin for `hookorama`.
 *
 * Writes a `hooks` block to `~/.config/devin/config.json` that dispatches
 * `hookorama hook devin <status>` at Devin CLI lifecycle events.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { HookRequest } from '@hookorama/client';
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

const EVENT_TO_STATUS: Record<DevinHookEvent, string> = {
  SessionStart: 'thinking',
  UserPromptSubmit: 'thinking',
  PreToolUse: 'running-tool',
  PostToolUse: 'thinking',
  PermissionRequest: 'waiting-input',
  Stop: 'done',
  SessionEnd: 'done',
};

// Devin uses %APPDATA%\devin\config.json on Windows and ~/.config/devin/config.json on POSIX.
const configPath = join(process.env['APPDATA'] ?? join(homedir(), '.config'), 'devin', 'config.json');

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
  return `${self} hook devin ${status} --cwd "$(pwd)"`;
}

function buildHooks(): DevinHooks {
  const hooks: Record<string, DevinHookEntry[]> = {};
  for (const event of HOOK_EVENTS) {
    hooks[event] = [
      {
        matcher: '',
        hooks: [{ type: 'command', command: buildCommand(EVENT_TO_STATUS[event]) }],
      },
    ];
  }
  return hooks;
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
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

function isHookoramaCommand(command: string): boolean {
  return command.includes('hook devin ');
}

export const devinPlugin: AgentPlugin = {
  name: 'devin',
  description: 'Devin CLI — writes ~/.config/devin/config.json hooks',

  buildHookRequest(agent: string, status: string, args: string[]): HookRequest {
    return buildCommonHookRequest(agent, status, args);
  },

  async install(opts: AgentPluginOptions = {}): Promise<void> {
    const config = await readConfig();
    const hooks: DevinHooks = { ...config.hooks };

    const newHooks = buildHooks();
    for (const event of HOOK_EVENTS) {
      hooks[event] = newHooks[event]!;
    }

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

    const remaining: DevinHooks = {};
    for (const [event, entries] of Object.entries(config.hooks)) {
      const filtered = entries
        .map((entry) => Object.assign({}, entry, { hooks: entry.hooks.filter((h) => !isHookoramaCommand(h.command)) }))
        .filter((entry) => entry.hooks.length > 0);
      if (filtered.length > 0) {
        remaining[event] = filtered;
      }
    }

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
