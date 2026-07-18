/**
 * `hookorama supervisor start|stop` command.
 */

import { readFile } from 'node:fs/promises';
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

  // Bun.serve keeps the process alive once the server is started.
}

export async function supervisorStop(): Promise<void> {
  const pidFile = pidFilePath({ product: 'hookorama-supervisor' });

  let raw: string;
  try {
    // The PID file path is a deterministic, non-user-controlled path
    // produced by pidFilePath(); this false positive is reported by
    // eslint-plugin-security's detect-non-literal-fs-filename.
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    raw = await readFile(pidFile.path, 'utf8');
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      console.warn('supervisor is not running (no PID file)');
      return;
    }
    throw err;
  }

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
