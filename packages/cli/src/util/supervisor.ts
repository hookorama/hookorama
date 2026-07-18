/**
 * Supervisor lifecycle helpers used by `hook` and `status` commands.
 */

import { spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

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
  const scriptPath = process.argv[1] ?? '';
  if (scriptPath.length === 0) {
    throw new Error('cannot determine CLI script path');
  }

  let exitReason: string | undefined;
  const child = spawn(process.execPath, [scriptPath, 'supervisor', 'start'], {
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore'],
    windowsHide: true,
  });
  child.unref();

  child.on('exit', (code, signal) => {
    if (code !== 0 || signal !== null) {
      exitReason = signal !== null ? `signal ${signal}` : `exit code ${code}`;
    }
  });

  if (await isSupervisorRunning()) {
    return;
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    await setTimeout(POLL_MS);
    if (await isSupervisorRunning()) {
      return;
    }
    if (exitReason !== undefined) {
      throw new Error(`supervisor failed to start (${exitReason})`);
    }
  }

  throw new Error('supervisor did not start in time');
}

/** Start the supervisor if it is not already running. */
export async function ensureSupervisor(): Promise<void> {
  if (await isSupervisorRunning()) {
    return;
  }
  await startSupervisor();
}

export { DEFAULT_HTTP_URL };
