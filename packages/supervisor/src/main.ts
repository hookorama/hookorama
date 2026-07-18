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
  // oxlint-disable-next-line unicorn/no-process-exit
  process.exit(1);
}

const server = new WireServer(supervisor);
await server.start();
console.warn('supervisor listening on %s', server.url().href);

let shuttingDown = false;
const shutdown = async (): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    await server.stop();
    await supervisor.stop();
  } catch (err) {
    console.error('shutdown failed:', err);
    // oxlint-disable-next-line unicorn/no-process-exit
    process.exit(1);
  }
  // oxlint-disable-next-line unicorn/no-process-exit
  process.exit(0);
};

process.on('SIGINT', () => {
  shutdown().catch((err) => {
    console.error('shutdown failed:', err);
    // oxlint-disable-next-line unicorn/no-process-exit
    process.exit(1);
  });
});
process.on('SIGTERM', () => {
  shutdown().catch((err) => {
    console.error('shutdown failed:', err);
    // oxlint-disable-next-line unicorn/no-process-exit
    process.exit(1);
  });
});
