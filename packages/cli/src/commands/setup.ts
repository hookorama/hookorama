/**
 * `hookorama setup <agent>` command.
 */

import { getPlugin } from '../plugin-registry.js';
import type { AgentPlugin } from '../plugin.js';

export async function setup(agent: string, update: boolean, remove: boolean, dryRun: boolean): Promise<void> {
  if (update && remove) {
    console.error('error: --update and --remove are mutually exclusive');
    process.exitCode = 1;
    return;
  }

  let plugin: AgentPlugin;
  try {
    plugin = getPlugin(agent);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
    return;
  }

  if (remove) {
    await plugin.remove({ dryRun });
    return;
  }

  if (update) {
    await plugin.update({ dryRun });
    return;
  }

  await plugin.install({ dryRun });
}
