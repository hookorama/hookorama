import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, afterEach } from 'vitest';
import { SupervisorClient } from '@hookorama/client';
import type { Status, WireSnapshot } from '@hookorama/client';
import { Supervisor } from '../supervisor.js';
import { WireServer } from './server.js';

interface TestHarness {
  pidPath: string;
  supervisor: Supervisor;
  server: WireServer;
  client: SupervisorClient;
  cleanup: () => Promise<void>;
}

async function setup(): Promise<TestHarness> {
  const pidPath = join(tmpdir(), 'hookorama-supervisor-test', `${randomUUID()}.pid`);
  await mkdir(join(pidPath, '..'), { recursive: true });

  const supervisor = new Supervisor({ discovery: null, lifecycle: { customPidPath: pidPath } });
  const started = await supervisor.start();
  expect(started).toBe(true);

  const server = new WireServer(supervisor, { port: 0, hostname: '127.0.0.1' });
  await server.start();

  const baseUrl = server.url().toString().replace(/\/$/, '');
  const wsUrl = new URL('/ws', server.url()).toString().replace(/^http:/, 'ws:');

  const client = new SupervisorClient({ httpUrl: baseUrl, wsUrl });

  return {
    pidPath,
    supervisor,
    server,
    client,
    async cleanup() {
      client.stop();
      await server.stop();
      await supervisor.stop();
      await rm(pidPath, { force: true });
    },
  };
}

describe('WireServer', () => {
  let harness: TestHarness | null = null;

  afterEach(async () => {
    await harness?.cleanup();
    harness = null;
  });

  it('serves an initial snapshot and broadcasts live updates', async () => {
    harness = await setup();
    const { client } = harness;

    let initialSnapshot = null as WireSnapshot | null;
    client.setOnSnapshot((snapshot) => {
      if (initialSnapshot === null) {
        initialSnapshot = snapshot;
      }
    });

    const openPromise = new Promise<void>((resolve) => client.setOnOpen(resolve));
    await client.start();
    await openPromise;

    expect(initialSnapshot).not.toBeNull();
    if (initialSnapshot !== null) {
      expect(initialSnapshot.entries).toHaveLength(0);
    }

    let liveSnapshot = null as WireSnapshot | null;
    let eventType = '';

    const snapshotPromise = new Promise<void>((resolve) => {
      client.setOnSnapshot((snapshot) => {
        if (snapshot.entries.length === 1) {
          liveSnapshot = snapshot;
          resolve();
        }
      });
    });

    client.setOnEvent((event) => {
      eventType = event.type;
    });

    const status: Status = 'thinking';
    await client.sendHook({
      status,
      cwd: '/tmp/test',
      agent: 'test-agent',
      metadata: {
        currentTask: 'thinking about the test',
        projectId: 'proj_test',
        origin: 'terminal',
      },
    });

    await snapshotPromise;

    expect(liveSnapshot).not.toBeNull();
    if (liveSnapshot !== null) {
      expect(liveSnapshot.entries).toHaveLength(1);

      const entry = liveSnapshot.entries[0];
      if (entry === undefined) throw new Error('entry missing');
      expect(entry.status).toBe('thinking');
      expect(entry.agent).toBe('test-agent');
      expect(entry.metadata).toMatchObject({
        currentTask: 'thinking about the test',
        projectId: 'proj_test',
        origin: 'terminal',
      });
    }

    expect(eventType).toBe('thinking');
  });

  it('serves GET /api/processes', async () => {
    harness = await setup();
    const { client } = harness;

    const processes = await client.fetchProcesses();
    expect(processes).toEqual([]);
  });
});
