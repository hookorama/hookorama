/**
 * `hookorama supervisor start|stop` command.
 */

import { readFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import { pidFilePath, isProcessRunning, releasePidSlot, runSupervisorDaemon } from '@hookorama/supervisor';
import { isSupervisorRunning } from '../util/supervisor.js';

const STOP_ATTEMPTS = 25;
const STOP_POLL_MS = 200;

export async function supervisorStart(): Promise<void> {
  const acquired = await runSupervisorDaemon();

  if (!acquired) {
    console.warn('supervisor is already running');
    process.exitCode = 0;
    return;
  }

  // The running http/ws server keeps the process alive once started.
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

  if (!(await isSupervisorRunning())) {
    console.warn('supervisor is not listening on its HTTP port, cleaning up stale PID file');
    await releasePidSlot(pidFile);
    return;
  }

  try {
    process.kill(pid, 'SIGTERM');
  } catch (error) {
    console.warn('failed to stop supervisor:', error);
    await releasePidSlot(pidFile);
    process.exitCode = 1;
    return;
  }

  for (let attempt = 0; attempt < STOP_ATTEMPTS; attempt += 1) {
    if (!(await isProcessRunning(pid))) {
      console.warn('supervisor stopped (pid %d)', pid);
      return;
    }
    await setTimeout(STOP_POLL_MS);
  }

  console.warn('supervisor did not stop in time (pid %d)', pid);
  process.exitCode = 1;
}
