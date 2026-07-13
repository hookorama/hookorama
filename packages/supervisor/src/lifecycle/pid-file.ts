/**
 * Lifecycle: PID file, idempotent auto‑start, signal handling.
 *
 * The supervisor writes its PID to a platform‑specific path
 * (XDG runtime dir on Linux, per‑user Application Support on
 * macOS, %LOCALAPPDATA% on Windows) and refuses to start a
 * second instance while that file exists and points at a live
 * process.
 */

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, platform, tmpdir } from 'node:os';
import { isProcessRunning } from './pid.js';

export interface PidPath {
  readonly path: string;
}

export interface LifecycleOptions {
  readonly product: 'hookorama-supervisor';
  readonly customPath?: string;
}

/**
 * Compute the platform‑appropriate PID file path.
 *
 * Linux:  `$XDG_RUNTIME_DIR/hookorama/supervisor.pid` or
 *         `~/.cache/hookorama/supervisor.pid` if XDG_RUNTIME_DIR
 *         is unset.
 * macOS:  `~/Library/Application Support/dev.hookorama/supervisor.pid`.
 * Windows: `%LOCALAPPDATA%\hookorama\supervisor.pid`.
 *
 * Override with `customPath` for tests.
 */
export function pidFilePath(opts: LifecycleOptions): PidPath {
  if (opts.customPath !== undefined) {
    return { path: opts.customPath };
  }
  switch (platform()) {
    case 'linux': {
      const xdg = process.env['XDG_RUNTIME_DIR'];
      const base =
        xdg !== undefined && xdg.length > 0
          ? xdg
          : join(homedir(), '.cache');
      return { path: join(base, 'hookorama', 'supervisor.pid') };
    }
    case 'darwin':
      return {
        path: join(
          homedir(),
          'Library',
          'Application Support',
          'dev.hookorama',
          'supervisor.pid',
        ),
      };
    case 'win32': {
      const local = process.env['LOCALAPPDATA'] ?? join(homedir(), 'AppData', 'Local');
      return { path: join(local, 'hookorama', 'supervisor.pid') };
    }
    default:
      return { path: join(tmpdir(), 'hookorama-supervisor.pid') };
  }
}

/**
 * Acquire the PID file. Returns the existing PID (a number) if
 * another supervisor is alive; returns `null` if the slot is
 * free and the caller should write its own PID.
 *
 * Atomic on POSIX because `writeFile` does an O_CREAT|O_EXCL
 * dance when the parent directory exists.
 */
export async function acquirePidSlot(
  target: PidPath,
  myPid: number,
): Promise<{ acquired: true } | { acquired: false; existingPid: number }> {
  await mkdir(dirname(target.path), { recursive: true });
  if (existsSync(target.path)) {
    const raw = await readFile(target.path, 'utf8').catch(() => '');
    const existing = Number(raw.trim());
    if (Number.isFinite(existing) && isProcessRunning(existing)) {
      return { acquired: false, existingPid: existing };
    }
    await rm(target.path, { force: true });
  }
  await writeFile(target.path, `${myPid}\n`, { flag: 'wx' });
  return { acquired: true };
}

/**
 * Release the PID file. Idempotent: removing a non‑existent
 * file is not an error.
 */
export async function releasePidSlot(target: PidPath): Promise<void> {
  await rm(target.path, { force: true });
}

function dirname(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i === -1 ? '.' : p.slice(0, i) || '.';
}