import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, afterEach } from 'vitest';
import { SupervisorClient } from '@hookorama/client';
import type { Status, WireSnapshot } from '@hookorama/client';
import { Supervisor } from '../supervisor.js';
import { WireServer } from './server.js';

interface TestHarness {
  tmpDir: string;
  supervisor: Supervisor;
  server: WireServer;
  client: SupervisorClient;
  cleanup: () => Promise<void>;
}

async function setup(): Promise<TestHarness> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'hookorama-supervisor-test-'));
  const pidPath = join(tmpDir, 'supervisor.pid');

  const supervisor = new Supervisor({ discovery: null, lifecycle: { customPidPath: pidPath } });
  const started = await supervisor.start();
  expect(started).toBe(true);

  const server = new WireServer(supervisor, { port: 0, hostname: '127.0.0.1' });
  await server.start();

  const baseUrl = server.url().toString().replace(/\/$/, '');
  const wsUrl = new URL('/ws', server.url()).toString().replace(/^http:/, 'ws:');

  const client = new SupervisorClient({ httpUrl: baseUrl, wsUrl });

  return {
    tmpDir,
    supervisor,
    server,
    client,
    async cleanup() {
      client.stop();
      await server.stop();
      await supervisor.stop();
      await rm(tmpDir, { force: true, recursive: true });
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

  it('rejects POST /api/reset when E2E_ALLOW_RESET is not set', async () => {
    harness = await setup();
    const prev = process.env['E2E_ALLOW_RESET'];
    delete process.env['E2E_ALLOW_RESET'];
    try {
      const response = await fetch(`${harness.server.url()}/api/reset`, { method: 'POST' });
      expect(response.status).toBe(404);
    } finally {
      if (prev !== undefined) {
        process.env['E2E_ALLOW_RESET'] = prev;
      }
    }
  });

  it('allows POST /api/reset only from local origins when E2E_ALLOW_RESET is set', async () => {
    harness = await setup();
    const prev = process.env['E2E_ALLOW_RESET'];
    process.env['E2E_ALLOW_RESET'] = '1';
    try {
      const baseUrl = harness.server.url().toString();
      const local = await fetch(`${baseUrl}/api/reset`, {
        method: 'POST',
        headers: { Origin: 'http://127.0.0.1:3000' },
      });
      expect(local.status).toBe(204);

      const ipv6 = await fetch(`${baseUrl}/api/reset`, {
        method: 'POST',
        headers: { Origin: 'http://[::1]:3000' },
      });
      expect(ipv6.status).toBe(204);

      const remote = await fetch(`${baseUrl}/api/reset`, {
        method: 'POST',
        headers: { Origin: 'http://evil.com' },
      });
      expect(remote.status).toBe(403);
    } finally {
      if (prev !== undefined) {
        process.env['E2E_ALLOW_RESET'] = prev;
      } else {
        delete process.env['E2E_ALLOW_RESET'];
      }
    }
  });
});
