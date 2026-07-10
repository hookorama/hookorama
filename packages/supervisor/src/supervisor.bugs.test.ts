import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { Supervisor } from './supervisor.js';
import type { ProcessDiscovery, ProcessRow } from './process-discovery/index.js';

describe('Supervisor bug fixes', () => {
  let workDir: string;
  let pidPath: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'hookorama-supervisor-bugs-'));
    pidPath = join(workDir, 'supervisor.pid');
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  test('start reclaims a stale PID file pointing at a dead process', async () => {
    const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 0)'], { stdio: 'ignore' });
    const stalePid = child.pid;
    if (stalePid === undefined) {
      throw new Error('spawn returned no pid; cannot exercise stale-PID reclaim');
    }
    const exitCode = await new Promise<number | null>((resolve) => {
      child.once('exit', (code) => resolve(code));
    });
    expect(exitCode).not.toBeNull();
    writeFileSync(pidPath, `${stalePid}\n`, 'utf8');
    const sup = new Supervisor({ lifecycle: { customPidPath: pidPath }, discovery: null });
    expect(await sup.start()).toBe(true);
    await sup.stop();
  });

  test('start refuses to reclaim when the PID file owner is alive', async () => {
    writeFileSync(pidPath, `${process.pid}\n`, 'utf8');
    const sup = new Supervisor({ lifecycle: { customPidPath: pidPath }, discovery: null });
    expect(await sup.start()).toBe(false);
  });

  test('start releases the PID slot if discovery throws', async () => {
    const failing: ProcessDiscovery = { list: () => Promise.reject(new Error('boom')) };
    const sup = new Supervisor({ lifecycle: { customPidPath: pidPath }, discovery: failing });
    await expect(sup.start()).rejects.toThrow('boom');
    const fresh = new Supervisor({ lifecycle: { customPidPath: pidPath }, discovery: null });
    expect(await fresh.start()).toBe(true);
    await fresh.stop();
  });

  test('two subagents opened at the same timestamp do not collide', () => {
    const sup = new Supervisor({ lifecycle: { customPidPath: pidPath }, discovery: null });
    sup.setOpenTerminals([{ pid: 7, cwd: '/p' }]);
    const identity = sup.applyHook({ pidChain: [7], cwd: '/p', status: 'thinking' });
    expect(identity).not.toBeNull();
    if (identity === null) return;
    const ts = '2026-07-10T00:00:01.000Z';
    const first = sup.startSubagent(identity, ts);
    const second = sup.startSubagent(identity, ts);
    expect(first).not.toBe(second);
    expect(sup.snapshot()).toHaveLength(3);
  });

  test('a discovery that returns rows keeps the PID slot acquired', async () => {
    const rows: readonly ProcessRow[] = [{ pid: 42, ppid: 1, command: 'sh' }];
    const discovery: ProcessDiscovery = { list: () => Promise.resolve(rows) };
    const sup = new Supervisor({ lifecycle: { customPidPath: pidPath }, discovery });
    expect(await sup.start()).toBe(true);
    await sup.stop();
  });
});
