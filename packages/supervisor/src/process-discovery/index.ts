/**
 * Process discovery — walk the OS process table and return a
 * snapshot the supervisor uses to seed its live state on
 * startup and to back the extension's `pidChain` resolution.
 *
 * The supervisor never spawns or terminates processes here; it
 * only reads. Each platform ships its own walker behind the
 * same interface. The walkers use `node:child_process` and
 * `node:fs/promises` so the package is runtime‑neutral and the
 * test runner (vitest under Node) can exercise them.
 */

import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';

export interface ProcessRow {
  readonly pid: number;
  readonly ppid: number;
  readonly command: string;
  readonly user: string;
  readonly tty?: string;
  readonly startedAt: number;
}

export interface ProcessDiscovery {
  list(): Promise<readonly ProcessRow[]>;
}

async function spawnLines(
  cmd: readonly string[],
): Promise<readonly string[]> {
  return new Promise<readonly string[]>((resolve, reject) => {
    const child = spawn(cmd[0]!, cmd.slice(1), { stdio: ['ignore', 'pipe', 'pipe'] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => {
      out.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      err.push(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`spawn ${cmd.join(' ')} failed: ${Buffer.concat(err).toString()}`));
        return;
      }
      const text = Buffer.concat(out).toString('utf8');
      resolve(text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0));
    });
  });
}

/**
 * Linux walker: parses `/proc/<pid>/stat`. No shell, no external
 * commands.
 */
export class LinuxProcDiscovery implements ProcessDiscovery {
  async list(): Promise<readonly ProcessRow[]> {
    const entries: ProcessRow[] = [];
    const names = await readDirNames('/proc');
    for (const name of names) {
      if (!/^\d+$/.test(name)) continue;
      const pid = Number(name);
      const statPath = `/proc/${pid}/stat`;
      const commPath = `/proc/${pid}/comm`;
      let stat: string;
      try {
        stat = await readFile(statPath, 'utf8');
      } catch {
        continue;
      }
      const row = parseStat(stat);
      if (row === null) continue;
      let command = '';
      try {
        command = (await readFile(commPath, 'utf8')).trim();
      } catch {
        // ignore — comm is optional
      }
      entries.push({ pid, ppid: row.ppid, command, user: '?', startedAt: Date.now() });
    }
    return entries;
  }
}

async function readDirNames(dir: string): Promise<readonly string[]> {
  const { readdir } = await import('node:fs/promises');
  return readdir(dir);
}

function parseStat(stat: string): { ppid: number } | null {
  // `/proc/<pid>/stat` layout: pid (comm) state ppid ...
  // The comm field is wrapped in parens and may contain spaces
  // and parens, so we split from the right.
  const lastParen = stat.lastIndexOf(')');
  if (lastParen === -1) return null;
  const after = stat.slice(lastParen + 1).trim();
  const fields = after.split(/\s+/);
  const ppid = Number(fields[1]);
  if (!Number.isFinite(ppid) || ppid <= 0) return null;
  return { ppid };
}

/**
 * macOS walker: shells out to `ps -axo pid=,ppid=,comm=`. The
 * `=` suffixes suppress headers; we parse by whitespace.
 */
export class MacPsDiscovery implements ProcessDiscovery {
  async list(): Promise<readonly ProcessRow[]> {
    const lines = await spawnLines(['ps', '-axo', 'pid=,ppid=,comm=']);
    const rows: ProcessRow[] = [];
    for (const line of lines) {
      const match = /^(\d+)\s+(\d+)\s+(.*)$/.exec(line);
      if (match === null) continue;
      const [, pidRaw, ppidRaw, command] = match;
      const pid = Number(pidRaw);
      const ppid = Number(ppidRaw);
      if (!Number.isFinite(pid) || !Number.isFinite(ppid)) continue;
      rows.push({ pid, ppid, command: command ?? '', user: '?', startedAt: Date.now() });
    }
    return rows;
  }
}

/**
 * Windows walker: tries `wmic` first, then falls back to
 * PowerShell `Get-CimInstance Win32_Process` because `wmic` is
 * removed on recent Windows. CSV output is parsed defensively.
 */
export class WindowsWmicDiscovery implements ProcessDiscovery {
  async list(): Promise<readonly ProcessRow[]> {
    const wmicRows = await this.tryWmic();
    if (wmicRows !== null && wmicRows.length > 0) return wmicRows;
    return this.tryPowerShell();
  }

  private async tryWmic(): Promise<readonly ProcessRow[] | null> {
    let lines: readonly string[];
    try {
      lines = await spawnLines([
        'wmic',
        'process',
        'get',
        'ProcessId,ParentProcessId,Name',
        '/FORMAT:CSV',
      ]);
    } catch {
      return null;
    }
    if (lines.length < 2) return null;
    return this.parseCsvRows(lines.slice(1), ['name', 'ppid', 'pid']);
  }

  private async tryPowerShell(): Promise<readonly ProcessRow[]> {
    let lines: readonly string[];
    try {
      lines = await spawnLines([
        'powershell',
        '-Command',
        'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name | ConvertTo-Csv -NoTypeInformation',
      ]);
    } catch {
      return [];
    }
    if (lines.length < 2) return [];
    return this.parseCsvRows(lines.slice(1), ['pid', 'ppid', 'name']);
  }

  private parseCsvRows(
    lines: readonly string[],
    columns: readonly ['name', 'ppid', 'pid'] | readonly ['pid', 'ppid', 'name'],
  ): ProcessRow[] {
    const rows: ProcessRow[] = [];
    for (const line of lines) {
      const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      if (cols.length < 3) continue;

      let pid: number;
      let ppid: number;
      let command: string;

      if (columns[0] === 'name') {
        command = cols[0] ?? '';
        ppid = Number(cols[1]);
        pid = Number(cols[2]);
      } else {
        pid = Number(cols[0]);
        ppid = Number(cols[1]);
        command = cols[2] ?? '';
      }

      if (!Number.isFinite(pid) || !Number.isFinite(ppid)) continue;
      rows.push({ pid, ppid, command, user: '?', startedAt: Date.now() });
    }
    return rows;
  }
}

export type SupportedPlatform = 'linux' | 'darwin' | 'win32';

/**
 * Pick the discovery walker for the current platform. Linux,
 * macOS, and Windows are supported. Anything else (BSD, others)
 * returns `null` and the supervisor logs that process discovery is
 * not available for this platform.
 */
export function pickDiscovery(platform: string): ProcessDiscovery | null {
  switch (platform) {
    case 'linux':
      return new LinuxProcDiscovery();
    case 'darwin':
      return new MacPsDiscovery();
    case 'win32':
      return new WindowsWmicDiscovery();
    default:
      return null;
  }
}