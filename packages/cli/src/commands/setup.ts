/**
 * `hookorama setup <agent>` command.
 */

import { getPlugin } from '../plugin-registry.js';

export async function setup(agent: string, update: boolean, remove: boolean, dryRun: boolean): Promise<void> {
  const plugin = getPlugin(agent);

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
