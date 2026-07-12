import { describe, expect, it } from 'vitest';
import type { HookEvent as WireHookEvent, ProcessEntry, WireSnapshot } from '@hookorama/client';
import { useHookoramaStore } from './store.js';

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
      type: 'thinking',
      summary: 'test-agent is thinking',
      payload: { projectId: 'proj_hookorama' },
    };

    useHookoramaStore.getState().applyEvent(event);

    const { events } = useHookoramaStore.getState();
    expect(events).toHaveLength(1);
    expect(events[0]?.agentId).toBe('pid:1234');
    expect(events[0]?.projectId).toBe('proj_hookorama');
    expect(events[0]?.type).toBe('status.update');
    expect(events[0]?.summary).toBe('test-agent is thinking');
  });
});
