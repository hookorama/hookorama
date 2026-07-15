/**
 * Plugin registry for built-in `hookorama` agents.
 *
 * PR 4 ships `claude` and `devin`. External plugins from
 * `node_modules/hookorama-plugin-*` or `~/.hookorama/plugins` can be added
 * later without changing the core CLI.
 */

import type { AgentPlugin } from './plugin.js';
import { claudePlugin } from './plugins/claude.js';
import { devinPlugin } from './plugins/devin.js';

const BUILT_IN = new Map<string, AgentPlugin>([
  [claudePlugin.name, claudePlugin],
  [devinPlugin.name, devinPlugin],
]);

export function getPlugin(name: string): AgentPlugin {
  const plugin = BUILT_IN.get(name);
  if (plugin === undefined) {
    const known = Array.from(BUILT_IN.keys()).join(', ');
    throw new Error(`unknown agent plugin: ${name} (known: ${known})`);
  }
  return plugin;
}

export function listPlugins(): AgentPlugin[] {
  return Array.from(BUILT_IN.values());
}
