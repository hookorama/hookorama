/**
 * Claude Code plugin for `hookorama`.
 *
 * Writes a `hooks` block to `.claude/settings.json` in the current project that
 * dispatches `hookorama hook claude <status>` at the lifecycle events Claude
 * Code supports: SessionStart, PreToolUse, PostToolUse, Notification, and Stop.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { HookRequest } from '@hookorama/client';
import type { AgentPlugin, AgentPluginOptions, AgentPluginStatus } from '../plugin.js';
import { buildCommonHookRequest } from './shared/hook-args.js';
import { getSelfCommand } from '../util/self-command.js';

const HOOK_EVENTS = ['SessionStart', 'PreToolUse', 'PostToolUse', 'Notification', 'Stop'] as const;

type ClaudeHookEvent = (typeof HOOK_EVENTS)[number];

const EVENT_TO_STATUS: Record<ClaudeHookEvent, string> = {
  SessionStart: 'thinking',
  PreToolUse: 'running-tool',
  PostToolUse: 'thinking',
  Notification: 'waiting-input',
  Stop: 'done',
};

const settingsPath = join(process.cwd(), '.claude', 'settings.json');

interface ClaudeHookCommand {
  readonly type: 'command';
  readonly command: string;
  readonly args?: readonly string[];
}

interface ClaudeHookEntry {
  readonly matcher?: string;
  readonly hooks: readonly ClaudeHookCommand[];
}

type ClaudeHooks = Record<string, readonly ClaudeHookEntry[]>;

interface ClaudeSettings {
  hooks?: ClaudeHooks;
}

function buildHookCommand(status: string): ClaudeHookCommand {
  const { runtime, script } = getSelfCommand();
  return {
    type: 'command',
    command: runtime,
    args: script.length > 0 ? [script, 'hook', 'claude', status] : ['hook', 'claude', status],
  };
}

function buildHooks(): ClaudeHooks {
  return Object.fromEntries(
    HOOK_EVENTS.map((event) => {
      const status = EVENT_TO_STATUS[event];
      return [event, [{ matcher: '', hooks: [buildHookCommand(status)] }]] as const;
    }),
  ) as ClaudeHooks;
}

async function readSettings(): Promise<ClaudeSettings> {
  if (!existsSync(settingsPath)) {
    return {};
  }
  const raw = await readFile(settingsPath, 'utf8');
  try {
    return JSON.parse(raw) as ClaudeSettings;
  } catch {
    throw new Error(`invalid JSON in ${settingsPath}`);
  }
}

async function writeSettings(settings: ClaudeSettings, dryRun?: boolean): Promise<void> {
  if (dryRun) {
    console.warn('[dry-run] would write %s', settingsPath);
    console.warn(JSON.stringify(settings, null, 2));
    return;
  }
  await mkdir(dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
}

function isHookoramaCommand(hook: ClaudeHookCommand): boolean {
  if (!Array.isArray(hook.args) || hook.args.length < 3) return false;
  return hook.args[1] === 'hook' && hook.args[2] === 'claude';
}

export const claudePlugin: AgentPlugin = {
  name: 'claude',
  description: 'Claude Code — writes ~/.claude/settings.json hooks',

  buildHookRequest(agent: string, status: string, args: string[]): HookRequest {
    return buildCommonHookRequest(agent, status, args);
  },

  async install(opts: AgentPluginOptions = {}): Promise<void> {
    const settings = await readSettings();
    const newHooks = buildHooks();
    const hooks: ClaudeHooks = { ...settings.hooks, ...newHooks };

    await writeSettings({ ...settings, hooks }, opts.dryRun);
    console.warn('Claude Code hooks installed to %s', settingsPath);
  },

  async update(opts: AgentPluginOptions = {}): Promise<void> {
    await this.install(opts);
    console.warn('Claude Code hooks updated');
  },

  async remove(opts: AgentPluginOptions = {}): Promise<void> {
    const settings = await readSettings();
    if (settings.hooks === undefined) {
      console.warn('Claude Code hooks not installed');
      return;
    }

    const remainingEntries = Object.entries(settings.hooks)
      .map(([event, entries]) => {
        const filtered = entries
          .map((entry) => ({ ...entry, hooks: entry.hooks.filter((h) => !isHookoramaCommand(h)) }))
          .filter((entry) => entry.hooks.length > 0);
        return [event, filtered] as const;
      })
      .filter(([, filtered]) => filtered.length > 0);
    const remaining = Object.fromEntries(remainingEntries) as ClaudeHooks;

    const next: ClaudeSettings = { ...settings };
    if (Object.keys(remaining).length > 0) {
      next.hooks = remaining;
    } else {
      delete next.hooks;
    }

    await writeSettings(next, opts.dryRun);
    console.warn('Claude Code hooks removed from %s', settingsPath);
  },

  async status(): Promise<AgentPluginStatus> {
    const installed = existsSync(settingsPath);
    const settings = installed ? await readSettings() : {};
    const hasHookorama =
      settings.hooks !== undefined &&
      Object.values(settings.hooks).some((entries) =>
        entries.some((entry) => entry.hooks.some((h) => isHookoramaCommand(h))),
      );
    return { installed: hasHookorama, path: settingsPath };
  },
};
