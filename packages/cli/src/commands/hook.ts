/**
 * `hookorama hook <agent> <status>` command.
 */

import { SupervisorClient } from '@hookorama/client';
import { getPlugin } from '../plugin-registry.js';
import { ensureSupervisor } from '../util/supervisor.js';

const DEFAULT_HTTP_URL = 'http://127.0.0.1:7354';
const DEFAULT_WS_URL = 'ws://127.0.0.1:7354/ws';

export async function hook(agent: string, status: string, argv: string[]): Promise<void> {
  const plugin = getPlugin(agent);
  const request = plugin.buildHookRequest(agent, status, argv);

  await ensureSupervisor();

  const client = new SupervisorClient({ httpUrl: DEFAULT_HTTP_URL, wsUrl: DEFAULT_WS_URL });
  await client.sendHook(request);
  console.warn('hook dispatched: %s -> %s', agent, status);
}
