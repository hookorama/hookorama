import { beforeEach, describe, expect, it } from 'vitest';
import type { HookEvent as WireHookEvent, ProcessEntry, WireSnapshot } from '@hookorama/client';
import { selectAgentTree, selectProcessTree, useHookoramaStore } from './store.js';
import type { Agent, Process } from './types.js';

function makeEntry(partial: Partial<ProcessEntry> & Pick<ProcessEntry, 'key' | 'status' | 'cwd'>): ProcessEntry {
  return {
    at: new Date().toISOString(),
    agent: 'test-agent',
    sessionId: 'sess_1',
    pid: 1234,
    metadata: {},
    ...partial,
  };
}

describe('useHookoramaStore', () => {
  beforeEach(() => {
    useHookoramaStore.setState({
      projects: [],
      agents: [],
      processes: [],
      events: [],
      notifications: [],
      notificationAcks: new Set<string>(),
      scanlines: false,
      buckets: [],
      agentTotals: {},
      nextBucketId: 0,
      skillHistory: {},
      modelHistory: {},
      connection: 'disconnected',
    });
  });

  it('maps a live snapshot to agents, projects and notifications', () => {
    const snapshot: WireSnapshot = {
      at: new Date().toISOString(),
      entries: [
        makeEntry({
          key: 'pid:1234',
          status: 'waiting-input',
          cwd: '/home/user/hookorama',
          metadata: {
            currentTask: 'waiting for approval',
            waitingReason: 'approve rm -rf dist?',
            projectId: 'proj_hookorama',
            origin: 'terminal',
            model: 'claude-sonnet-4.5',
            skill: 'refactor',
            metrics: { tasks: 5, toolCalls: 12, cost: 0.34, errors: 0 },
          },
        }),
        makeEntry({
          key: 'pid:1235',
          status: 'thinking',
          cwd: '/home/user/paygrid-api',
          metadata: {
            currentTask: 'design webhook signer',
            projectId: 'proj_paygrid',
            origin: 'vscode',
            metrics: { tasks: 2, toolCalls: 3, cost: 0.12, errors: 0 },
          },
        }),
      ],
    };

    useHookoramaStore.getState().syncSnapshot(snapshot);

    const { agents, projects, notifications, connection } = useHookoramaStore.getState();

    expect(connection).toBe('connected');
    expect(agents).toHaveLength(2);

    const first = agents.find((a) => a.id === 'pid:1234');
    expect(first).not.toBeUndefined();
    expect(first?.status).toBe('waiting-input');
    expect(first?.projectId).toBe('proj_hookorama');
    expect(first?.currentTask).toBe('waiting for approval');
    expect(first?.waitingReason).toBe('approve rm -rf dist?');
    expect(first?.origin).toBe('terminal');
    expect(first?.metrics).toEqual({ tasks: 5, toolCalls: 12, cost: 0.34, errors: 0 });

    expect(projects).toHaveLength(2);
    const hookoramaProject = projects.find((p) => p.id === 'proj_hookorama');
    expect(hookoramaProject).not.toBeUndefined();
    expect(hookoramaProject?.name).toBe('proj_hookorama');

    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.agentId).toBe('pid:1234');
    expect(notifications[0]?.kind).toBe('waiting-input');
  });

  it('preserves notification ack state across snapshots', () => {
    const snapshot: WireSnapshot = {
      at: new Date().toISOString(),
      entries: [
        makeEntry({
          key: 'pid:1234',
          status: 'waiting-input',
          cwd: '/home/user/hookorama',
          metadata: {
            waitingReason: 'approve rm -rf dist?',
            projectId: 'proj_hookorama',
          },
        }),
      ],
    };

    useHookoramaStore.getState().syncSnapshot(snapshot);
    const id = useHookoramaStore.getState().notifications[0]?.id;
    expect(id).toBeDefined();
    useHookoramaStore.getState().ackNotification(id!);
    useHookoramaStore.getState().syncSnapshot(snapshot);

    const { notifications } = useHookoramaStore.getState();
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.ack).toBe(true);
  });

  it('applies incoming wire events to the events stream', () => {
    const event: WireHookEvent = {
      id: 'evt_1',
      ts: Date.now(),
      key: 'pid:1234',
      agent: 'test-agent',
      type: 'tool.call',
      summary: 'test-agent is thinking',
      payload: { projectId: 'proj_hookorama' },
    };

    useHookoramaStore.getState().applyEvent(event);

    const { events } = useHookoramaStore.getState();
    expect(events).toHaveLength(1);
    expect(events[0]?.agentId).toBe('pid:1234');
    expect(events[0]?.projectId).toBe('proj_hookorama');
    expect(events[0]?.type).toBe('tool.call');
    expect(events[0]?.summary).toBe('test-agent is thinking');
  });

  it('selectAgentTree groups by parent id', () => {
    const parent: Agent = {
      id: 'a1',
      name: 'parent',
      type: 'agent',
      status: 'thinking',
      origin: 'terminal',
      sessionId: 's1',
      projectId: 'p1',
      createdAt: 0,
      updatedAt: 0,
      metrics: { tasks: 1, toolCalls: 0, cost: 0, errors: 0 },
    };
    const child: Agent = {
      id: 'a2',
      name: 'child',
      type: 'subagent',
      status: 'running-tool',
      parentId: 'a1',
      origin: 'terminal',
      sessionId: 's1',
      projectId: 'p1',
      createdAt: 0,
      updatedAt: 0,
      metrics: { tasks: 0, toolCalls: 0, cost: 0, errors: 0 },
    };
    const tree = selectAgentTree({ agents: [parent, child] });
    expect(tree.get(undefined)).toEqual([parent]);
    expect(tree.get('a1')).toEqual([child]);
  });

  it('selectProcessTree groups by parent pid', () => {
    const init: Process = { pid: 1, ppid: 0, cmd: 'init', user: 'root', startedAt: 0, type: 'system' };
    const bash: Process = { pid: 42, ppid: 1, cmd: 'bash', user: 'root', startedAt: 0, type: 'agent' };
    const tree = selectProcessTree({ processes: [init, bash] });
    expect(tree.get(0)).toEqual([init]);
    expect(tree.get(1)).toEqual([bash]);
  });

  it('syncSnapshot updates buckets, skill history and model history', () => {
    const snapshot: WireSnapshot = {
      at: new Date().toISOString(),
      entries: [
        makeEntry({
          key: 'pid:1234',
          status: 'thinking',
          cwd: '/home/user/hookorama',
          metadata: {
            projectId: 'proj_hookorama',
            skill: 'refactor',
            model: 'claude-sonnet-4.5',
            metrics: { tasks: 3, toolCalls: 5, cost: 0.2, errors: 0 },
          },
        }),
      ],
    };

    const before = useHookoramaStore.getState().buckets.length;
    useHookoramaStore.getState().syncSnapshot(snapshot);

    const { buckets, skillHistory, modelHistory } = useHookoramaStore.getState();
    expect(buckets).toHaveLength(before + 1);
    expect(buckets.at(-1)?.tasks).toBe(3);
    expect(buckets.at(-1)?.toolCalls).toBe(5);
    expect(skillHistory['refactor']).toBe(3);
    expect(modelHistory['claude-sonnet-4.5']?.calls).toBe(5);
    expect(modelHistory['claude-sonnet-4.5']?.cost).toBe(0.2);
  });

  it('stores per-project metric snapshots in buckets', () => {
    const snapshot: WireSnapshot = {
      at: new Date().toISOString(),
      entries: [
        makeEntry({
          key: 'pid:1',
          status: 'thinking',
          cwd: '/home/user/p1',
          sessionId: 's1',
          metadata: {
            projectId: 'p1',
            metrics: { tasks: 1, toolCalls: 2, cost: 0.1, errors: 0 },
          },
        }),
        makeEntry({
          key: 'pid:2',
          status: 'error',
          cwd: '/home/user/p2',
          sessionId: 's2',
          metadata: {
            projectId: 'p2',
            metrics: { tasks: 2, toolCalls: 1, cost: 0.2, errors: 1 },
          },
        }),
      ],
    };

    useHookoramaStore.getState().syncSnapshot(snapshot);

    const { buckets } = useHookoramaStore.getState();
    const bucket = buckets.at(-1);
    expect(bucket).not.toBeUndefined();
    expect(bucket?.byProject.get('p1')?.tasks).toBe(1);
    expect(bucket?.byProject.get('p2')?.errors).toBe(1);
    expect(bucket?.errors).toBe(1);
  });

  it('preserves lastErrorAt across snapshots for the same session', () => {
    const t1 = new Date('2026-01-01T00:00:00.000Z').toISOString();
    const snapshot1: WireSnapshot = {
      at: t1,
      entries: [
        makeEntry({
          key: 'pid:1',
          status: 'error',
          cwd: '/home/user/p1',
          sessionId: 's1',
          metadata: {
            projectId: 'p1',
            lastErrorAt: t1,
            metrics: { tasks: 0, toolCalls: 0, cost: 0, errors: 1 },
          },
        }),
      ],
    };
    useHookoramaStore.getState().syncSnapshot(snapshot1);
    const first = useHookoramaStore.getState().agents[0]?.lastErrorAt;
    expect(first).toBe(Date.parse(t1));

    const t2 = new Date('2026-01-01T00:00:01.000Z').toISOString();
    const snapshot2: WireSnapshot = {
      at: t2,
      entries: [
        makeEntry({
          key: 'pid:1',
          status: 'error',
          at: t2,
          cwd: '/home/user/p1',
          sessionId: 's1',
          metadata: {
            projectId: 'p1',
            metrics: { tasks: 0, toolCalls: 0, cost: 0, errors: 1 },
          },
        }),
      ],
    };
    useHookoramaStore.getState().syncSnapshot(snapshot2);

    const { agents } = useHookoramaStore.getState();
    expect(agents[0]?.lastErrorAt).toBe(Date.parse(t1));
  });

  it('does not reuse lastErrorAt when the session changes', () => {
    const t1 = new Date('2026-01-01T00:00:00.000Z').toISOString();
    const snapshot1: WireSnapshot = {
      at: t1,
      entries: [
        makeEntry({
          key: 'pid:1',
          status: 'error',
          at: t1,
          cwd: '/home/user/p1',
          sessionId: 's1',
          metadata: {
            projectId: 'p1',
            lastErrorAt: t1,
            metrics: { tasks: 0, toolCalls: 0, cost: 0, errors: 1 },
          },
        }),
      ],
    };
    useHookoramaStore.getState().syncSnapshot(snapshot1);

    const t2 = new Date('2026-01-01T00:00:01.000Z').toISOString();
    const snapshot2: WireSnapshot = {
      at: t2,
      entries: [
        makeEntry({
          key: 'pid:1',
          status: 'error',
          at: t2,
          cwd: '/home/user/p1',
          sessionId: 's2',
          metadata: {
            projectId: 'p1',
            metrics: { tasks: 0, toolCalls: 0, cost: 0, errors: 1 },
          },
        }),
      ],
    };
    useHookoramaStore.getState().syncSnapshot(snapshot2);

    const { agents } = useHookoramaStore.getState();
    expect(agents[0]?.lastErrorAt).toBe(Date.parse(t2));
  });

  it('falls back to updatedAt for an invalid lastErrorAt timestamp', () => {
    const snapshotAt = new Date('2026-01-01T00:00:00.000Z').toISOString();
    const entryAt = new Date('2026-01-01T00:00:01.000Z').toISOString();
    const snapshot: WireSnapshot = {
      at: snapshotAt,
      entries: [
        makeEntry({
          key: 'pid:1',
          status: 'error',
          at: entryAt,
          cwd: '/home/user/p1',
          sessionId: 's1',
          metadata: {
            projectId: 'p1',
            lastErrorAt: 'not-a-timestamp',
            metrics: { tasks: 0, toolCalls: 0, cost: 0, errors: 1 },
          },
        }),
      ],
    };
    useHookoramaStore.getState().syncSnapshot(snapshot);

    const { agents } = useHookoramaStore.getState();
    expect(agents[0]?.lastErrorAt).toBe(Date.parse(entryAt));
  });
});
