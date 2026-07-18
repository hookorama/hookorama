/**
 * Common supervisor daemon boot/shutdown logic shared by `packages/supervisor`
 * and the `hookorama supervisor start` CLI command.
 */

import { Supervisor } from './supervisor.js';
import { WireServer } from './wire/server.js';

export async function runSupervisorDaemon(): Promise<boolean> {
  const supervisor = new Supervisor();
  const acquired = await supervisor.start();

  if (!acquired) {
    return false;
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

  return true;
}
