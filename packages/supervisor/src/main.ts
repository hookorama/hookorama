/**
 * Daemon entry point for the Hookorama supervisor.
 *
 * Acquires the PID slot, starts the wire server, and shuts down
 * cleanly on SIGINT/SIGTERM.
 */

import { Supervisor } from './supervisor.js';
import { WireServer } from './wire/server.js';

const supervisor = new Supervisor();
const acquired = await supervisor.start();
if (!acquired) {
  console.error('another supervisor is already running');
  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(1);
}

const server = new WireServer(supervisor);
await server.start();
console.warn('supervisor listening on %s', server.url().href);

const shutdown = async (): Promise<void> => {
  await server.stop();
  await supervisor.stop();
  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
