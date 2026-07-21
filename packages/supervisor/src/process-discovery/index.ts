/**
 * Process discovery — ask `@sysutils/ps` for the OS process table
 * and return a snapshot the supervisor uses to seed its live state
 * on startup and to back the extension's `pidChain` resolution.
 *
 * The supervisor never spawns or terminates processes here; it
 * only reads. `@sysutils/ps` owns the cross-platform native backends;
 * this file is a thin adapter that maps its `ProcessInfo` shape to
 * the supervisor's internal `ProcessRow`.
 *
 * We use `ProcessInfo.name` (the executable / comm field) as the row
 * `command` to match the previous per-OS walkers, which exposed a
 * short process name rather than the full command line.
 */

import { listProcesses, type ProcessInfo } from '@sysutils/ps';

export interface ProcessRow {
  readonly pid: number;
  readonly ppid: number;
  readonly command: string;
  readonly user?: string;
  readonly startedAt?: number;
  readonly tty?: string;
}

export interface ProcessDiscovery {
  list(): Promise<readonly ProcessRow[]>;
}

export function toProcessRow(info: ProcessInfo): ProcessRow {
  return {
    pid: info.pid,
    ppid: info.ppid,
    command: info.name || (info.command ?? ''),
    ...(info.user !== null && info.user !== undefined ? { user: info.user } : {}),
    ...(info.startedAt !== null && info.startedAt !== undefined ? { startedAt: info.startedAt } : {}),
  };
}

/**
 * Cross-platform process discovery backed by `@sysutils/ps`.
 * Works on Linux (`/proc`), macOS (`dotnet` or `ps`), and Windows
 * (`dotnet` or `wmic`/`Get-CimInstance`).
 */
export class SysutilsPsDiscovery implements ProcessDiscovery {
  async list(): Promise<readonly ProcessRow[]> {
    const rows = await listProcesses({
      fields: ['pid', 'ppid', 'name', 'command', 'user', 'startedAt'],
    });
    return rows.map(toProcessRow);
  }
}

/**
 * Pick the discovery walker for the current platform. Linux,
 * macOS, and Windows are all served by `@sysutils/ps`. Anything
 * else (BSD, others) returns `null` and the supervisor logs that
 * process discovery is not available for this platform.
 */
export function pickDiscovery(platform: string): ProcessDiscovery | null {
  switch (platform) {
    case 'linux':
    case 'darwin':
    case 'win32':
      return new SysutilsPsDiscovery();
    default:
      return null;
  }
}
