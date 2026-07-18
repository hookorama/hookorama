import { describe, expect, it } from 'vitest';
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
    useHookoramaStore.getState().ackNotification('pid:1234:waiting-input');
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
    expect(buckets.length).toBe(before + 1);
    expect(buckets.at(-1)?.tasks).toBe(3);
    expect(buckets.at(-1)?.toolCalls).toBe(5);
    expect(skillHistory['refactor']).toBe(3);
    expect(modelHistory['claude-sonnet-4.5']?.calls).toBe(5);
    expect(modelHistory['claude-sonnet-4.5']?.cost).toBe(0.2);
  });
});
