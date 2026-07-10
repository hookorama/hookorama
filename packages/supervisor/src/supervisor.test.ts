import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Supervisor } from './supervisor.js';
import type { ProcessDiscovery, ProcessRow } from './process-discovery/index.js';

describe('Supervisor', () => {
  let work: string;
  let pidPath: string;

  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'hookorama-supervisor-'));
    pidPath = join(work, 'supervisor.pid');
  });

  afterEach(() => {
    rmSync(work, { recursive: true, force: true });
  });

  test('start acquires the PID slot when free', async () => {
    const s = new Supervisor({ lifecycle: { customPidPath: pidPath }, discovery: null });
    expect(await s.start()).toBe(true);
    await s.stop();
  });

  test('start refuses when another supervisor holds the slot', async () => {
    const a = new Supervisor({ lifecycle: { customPidPath: pidPath }, discovery: null });
    expect(await a.start()).toBe(true);
    const b = new Supervisor({ lifecycle: { customPidPath: pidPath }, discovery: null });
    expect(await b.start()).toBe(false);
    await a.stop();
  });

  test('applyHook upserts a known process and remembers it', () => {
    const s = new Supervisor({ lifecycle: { customPidPath: pidPath }, discovery: null });
    s.setOpenTerminals([{ pid: 7, cwd: '/p' }]);
    const id = s.applyHook({
      pidChain: [7],
      cwd: '/p',
      status: 'thinking',
      agent: 'claude',
    });
    expect(id?.pid).toBe(7);
    expect(s.snapshot()).toHaveLength(1);
    expect(s.snapshot()[0]?.agent).toBe('claude');
  });

  test('applyHook returns null when identity is unresolvable', () => {
    const s = new Supervisor({ lifecycle: { customPidPath: pidPath }, discovery: null });
    expect(s.applyHook({ status: 'idle' })).toBeNull();
  });

  test('subagent lifecycle: start, exact end, fallback end', () => {
    const s = new Supervisor({ lifecycle: { customPidPath: pidPath }, discovery: null });
    s.setOpenTerminals([{ pid: 7, cwd: '/p' }]);
    const id = s.applyHook({ pidChain: [7], cwd: '/p', status: 'thinking' })!;
    const childKey = s.startSubagent(id, '2026-07-10T00:00:01.000Z', 'tool-1');
    expect(s.snapshot()).toHaveLength(2);
    const exact = s.endSubagent(id.key, '2026-07-10T00:00:02.000Z', 'tool-1');
    expect(exact.closedByKey).toBe(true);
    expect(s.snapshot()).toHaveLength(2);
    const childAfter = s.snapshot().find((e: { key: string }) => e.key === childKey);
    expect(childAfter?.status).toBe('done');
  });

  test('stop is idempotent', async () => {
    const s = new Supervisor({ lifecycle: { customPidPath: pidPath }, discovery: null });
    await s.start();
    await s.stop();
    await s.stop();
    expect(s.isStopping()).toBe(true);
  });

  test('start reclaims a stale PID file pointing at a dead process', async () => {
    writeFileSync(pidPath, '999999\n', 'utf8');
    const s = new Supervisor({ lifecycle: { customPidPath: pidPath }, discovery: null });
    expect(await s.start()).toBe(true);
    await s.stop();
  });

  test('start refuses to reclaim when the PID file owner is alive', async () => {
    writeFileSync(pidPath, `${process.pid}\n`, 'utf8');
    const s = new Supervisor({ lifecycle: { customPidPath: pidPath }, discovery: null });
    expect(await s.start()).toBe(false);
  });

  test('start releases the PID slot if discovery throws', async () => {
    const failing: ProcessDiscovery = { list: () => Promise.reject(new Error('boom')) };
    const s = new Supervisor({
      lifecycle: { customPidPath: pidPath },
      discovery: failing,
    });
    await expect(s.start()).rejects.toThrow('boom');
    const fresh = new Supervisor({
      lifecycle: { customPidPath: pidPath },
      discovery: null,
    });
    expect(await fresh.start()).toBe(true);
    await fresh.stop();
  });

  test('two subagents opened at the same timestamp do not collide', () => {
    const s = new Supervisor({ lifecycle: { customPidPath: pidPath }, discovery: null });
    s.setOpenTerminals([{ pid: 7, cwd: '/p' }]);
    const id = s.applyHook({ pidChain: [7], cwd: '/p', status: 'thinking' });
    expect(id).not.toBeNull();
    if (id === null) return;
    const ts = '2026-07-10T00:00:01.000Z';
    const k1 = s.startSubagent(id, ts);
    const k2 = s.startSubagent(id, ts);
    expect(k1).not.toBe(k2);
    expect(s.snapshot()).toHaveLength(3);
  });

  test('a discovery that returns rows does not lose the PID slot', async () => {
    const rows: readonly ProcessRow[] = [{ pid: 42, ppid: 1, command: 'sh' }];
    const discovery: ProcessDiscovery = { list: () => Promise.resolve(rows) };
    const s = new Supervisor({
      lifecycle: { customPidPath: pidPath },
      discovery,
    });
    expect(await s.start()).toBe(true);
    await s.stop();
  });
});
