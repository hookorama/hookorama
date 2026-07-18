/**
 * `hookorama hook <agent> <status>` command.
 */

import { setTimeout } from 'node:timers/promises';
import { SupervisorClient } from '@hookorama/client';
import type { Status } from '@hookorama/client';
import type { AgentPlugin } from '../plugin.js';
import { getPlugin } from '../plugin-registry.js';
import { ensureSupervisor } from '../util/supervisor.js';

const DEFAULT_HTTP_URL = 'http://127.0.0.1:7354';
const DEFAULT_WS_URL = 'ws://127.0.0.1:7354/ws';

export async function hook(agent: string, status: Status, argv: string[]): Promise<void> {
  let plugin: AgentPlugin;
  try {
    plugin = getPlugin(agent);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
    return;
  }
  const request = plugin.buildHookRequest(agent, status, argv);

  await ensureSupervisor();

  const client = new SupervisorClient({ httpUrl: DEFAULT_HTTP_URL, wsUrl: DEFAULT_WS_URL });
  await Promise.race([
    client.sendHook(request),
    setTimeout(5000).then(() => {
      throw new Error('hook request timed out');
    }),
  ]);
  console.warn('hook dispatched: %s -> %s', agent, status);
}
