/**
 * Daemon entry point for the Hookorama supervisor.
 *
 * Acquires the PID slot, starts the wire server, and shuts down
 * cleanly on SIGINT/SIGTERM.
 */

import { runSupervisorDaemon } from './run.js';

if (!(await runSupervisorDaemon())) {
  console.error('another supervisor is already running');
  // oxlint-disable-next-line unicorn/no-process-exit
  process.exit(1);
}
