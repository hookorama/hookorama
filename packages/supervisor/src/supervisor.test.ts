import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Supervisor } from './supervisor.js';
import type { ProcessDiscovery } from './process-discovery/index.js';

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

  test('applyHook upserts a known process and remembers it', async () => {
    const s = new Supervisor({ lifecycle: { customPidPath: pidPath }, discovery: null });
    s.setOpenTerminals([{ pid: 7, cwd: '/p' }]);
    const id = await s.applyHook({
      pidChain: [7],
      cwd: '/p',
      status: 'thinking',
      agent: 'claude',
    });
    expect(id?.pid).toBe(7);
    expect(s.snapshot()).toHaveLength(1);
    expect(s.snapshot()[0]?.agent).toBe('claude');
  });

  test('applyHook returns null when identity is unresolvable', async () => {
    const s = new Supervisor({ lifecycle: { customPidPath: pidPath }, discovery: null });
    expect(await s.applyHook({ status: 'idle' })).toBeNull();
  });

  test('applyHook falls back to the OS process table when open terminals are empty', async () => {
    const mockDiscovery: ProcessDiscovery = {
      list: async () => [{ pid: 42, ppid: 1, command: 'bash', user: 'u', startedAt: Date.now() }],
    };
    const s = new Supervisor({ lifecycle: { customPidPath: pidPath }, discovery: mockDiscovery });
    const id = await s.applyHook({ pidChain: [42], cwd: '/p', status: 'thinking', agent: 'claude' });
    expect(id?.pid).toBe(42);
    expect(s.snapshot()).toHaveLength(1);
    expect(s.snapshot()[0]?.agent).toBe('claude');
  });

  test('subagent lifecycle: start, exact end, fallback end', async () => {
    const s = new Supervisor({ lifecycle: { customPidPath: pidPath }, discovery: null });
    s.setOpenTerminals([{ pid: 7, cwd: '/p' }]);
    const id = (await s.applyHook({ pidChain: [7], cwd: '/p', status: 'thinking' }))!;
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

  test('processes annotates the OS tree with agent ids', async () => {
    const mockDiscovery: ProcessDiscovery = {
      list: async () => [
        { pid: 7, ppid: 0, command: 'bash', user: 'u', startedAt: Date.now() },
        { pid: 123, ppid: 7, command: 'worker', user: 'u', startedAt: Date.now() },
        { pid: 456, ppid: 0, command: 'Code', user: 'u', startedAt: Date.now() },
      ],
    };
    const s = new Supervisor({ lifecycle: { customPidPath: pidPath }, discovery: mockDiscovery });
    await s.start();
    s.setOpenTerminals([{ pid: 7, cwd: '/p' }]);
    await s.applyHook({ pidChain: [7], cwd: '/p', status: 'thinking', agent: 'claude' });

    const rows = await s.processes();
    expect(rows).toHaveLength(3);

    const bash = rows.find((r) => r.pid === 7);
    const worker = rows.find((r) => r.pid === 123);
    const code = rows.find((r) => r.pid === 456);

    expect(bash?.type).toBe('agent');
    expect(bash?.agentId).toBe('pid:7');
    expect(worker?.type).toBe('agent');
    expect(worker?.agentId).toBe('pid:7');
    expect(code?.type).toBe('ide');
    expect(code?.agentId).toBeUndefined();

    await s.stop();
  });
});