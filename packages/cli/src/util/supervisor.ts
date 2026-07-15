/**
 * Supervisor lifecycle helpers used by `hook` and `status` commands.
 */

import { spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

const DEFAULT_HTTP_URL = 'http://127.0.0.1:7354';
const MAX_ATTEMPTS = 25;
const POLL_MS = 200;

export async function isSupervisorRunning(httpUrl = DEFAULT_HTTP_URL): Promise<boolean> {
  try {
    const response = await fetch(`${httpUrl}/api/state`, { signal: AbortSignal.timeout(1000) });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Start the supervisor in a detached process. This is the same CLI binary
 * running the `supervisor start` subcommand.
 */
export async function startSupervisor(): Promise<void> {
  if (process.argv[1] === undefined || process.argv[1].length === 0) {
    throw new Error('cannot determine CLI script path');
  }

  const child = spawn(process.execPath, [process.argv[1], 'supervisor', 'start'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    await setTimeout(POLL_MS);
    if (await isSupervisorRunning()) {
      return;
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
