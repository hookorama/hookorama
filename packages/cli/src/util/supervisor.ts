/**
 * Supervisor lifecycle helpers used by `hook` and `status` commands.
 */

import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import { getSelfCommand } from './self-command.js';
import { isProcessRunning, pidFilePath } from '@hookorama/supervisor';

const DEFAULT_HTTP_URL = 'http://127.0.0.1:7354';
const MAX_ATTEMPTS = 25;
const POLL_MS = 200;

export function isSupervisorRunning(httpUrl = DEFAULT_HTTP_URL): Promise<boolean> {
  return fetch(`${httpUrl}/api/state`, { signal: AbortSignal.timeout(1000) })
    .then((response) => response.ok)
    .catch(() => false);
}

/**
 * Start the supervisor in a detached process. This is the same CLI binary
 * running the `supervisor start` subcommand.
 */
export async function startSupervisor(): Promise<void> {
  const pidFile = pidFilePath({ product: 'hookorama-supervisor' });
  const { runtime, script } = getSelfCommand();
  if (runtime.length === 0) {
    throw new Error('cannot determine CLI runtime');
  }
  const args = script.length > 0 ? [script, 'supervisor', 'start'] : ['supervisor', 'start'];

  const MAX_RETRIES = 3;
  for (let retry = 0; retry < MAX_RETRIES; retry += 1) {
    let childExited = false;
    const child = spawn(runtime, args, {
      detached: true,
      stdio: ['ignore', 'ignore', 'ignore'],
      windowsHide: true,
    });
    child.unref();

    child.on('exit', () => {
      childExited = true;
    });

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      await setTimeout(POLL_MS);
      if (childExited) {
        break;
      }
      const childPid = child.pid;
      if (childPid !== undefined) {
        const filePid = await readCurrentPid(pidFile);
        if (filePid === childPid) {
          // The child owns the PID file; wait for its HTTP endpoint to respond.
          for (let httpAttempt = 0; httpAttempt < MAX_ATTEMPTS; httpAttempt += 1) {
            if (await isSupervisorRunning()) {
              return;
            }
            await setTimeout(POLL_MS);
          }
          throw new Error('supervisor acquired the PID file but did not respond on HTTP');
        }
      }
    }

    if (!childExited) {
      throw new Error('supervisor did not write its PID file in time');
    }

    // The child exited before we saw our PID in the file. If an old supervisor
    // still owns the slot, wait for it to release and then retry.
    const currentPid = await readCurrentPid(pidFile);
    if (currentPid !== null && isProcessRunning(currentPid)) {
      console.warn('waiting for existing supervisor (pid %d) to release the PID file', currentPid);
      for (let wait = 0; wait < MAX_ATTEMPTS; wait += 1) {
        await setTimeout(POLL_MS);
        if (!isProcessRunning(currentPid)) {
          break;
        }
      }
      if (isProcessRunning(currentPid)) {
        throw new Error('existing supervisor did not release the PID file');
      }
      continue;
    }

    throw new Error('supervisor exited before acquiring the PID file');
  }

  throw new Error('supervisor failed to start after retries');
}

async function readCurrentPid(pidFile: ReturnType<typeof pidFilePath>): Promise<number | null> {
  try {
    const raw = await readFile(pidFile.path, 'utf8');
    const pid = Number(raw.trim());
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

/** Start the supervisor if it is not already running. */
export async function ensureSupervisor(): Promise<void> {
  if (await isSupervisorRunning()) {
    return;
  }
  await startSupervisor();
}

export { DEFAULT_HTTP_URL };
