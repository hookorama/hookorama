/**
 * `hookorama supervisor start|stop` command.
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { pidFilePath, isProcessRunning, releasePidSlot, Supervisor, WireServer } from '@hookorama/supervisor';

export async function supervisorStart(): Promise<void> {
  const supervisor = new Supervisor();
  const acquired = await supervisor.start();

  if (!acquired) {
    console.warn('supervisor is already running');
    process.exitCode = 0;
    return;
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

  // Bun.serve keeps the process alive once the server is started.
}

export async function supervisorStop(): Promise<void> {
  const pidFile = pidFilePath({ product: 'hookorama-supervisor' });

  if (!existsSync(pidFile.path)) {
    console.warn('supervisor is not running (no PID file)');
    return;
  }

  const raw = await readFile(pidFile.path, 'utf8');
  const pid = Number(raw.trim());

  if (!Number.isFinite(pid) || pid <= 0) {
    console.warn('supervisor PID file is invalid, cleaning up');
    await releasePidSlot(pidFile);
    return;
  }

  if (!(await isProcessRunning(pid))) {
    console.warn('supervisor PID file points to a dead process, cleaning up');
    await releasePidSlot(pidFile);
    return;
  }

  try {
    process.kill(pid, 'SIGTERM');
    console.warn('supervisor stopped (pid %d)', pid);
  } catch (error) {
    console.warn('failed to stop supervisor:', error);
    process.exitCode = 1;
  }
}
