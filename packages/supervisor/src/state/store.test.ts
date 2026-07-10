import { describe, expect, test } from 'vitest';
import { StateStore } from './store.js';
import { resolveIdentity, type OpenTerminal } from '../identity/resolve.js';

const TERMINALS: readonly OpenTerminal[] = [{ pid: 7, cwd: '/p' }];

describe('StateStore', () => {
  test('applyEvent writes a new entry', () => {
    const store = new StateStore();
    const identity = resolveIdentity([7], '/p', TERMINALS);
    expect(identity).not.toBeNull();
    if (identity === null) return;
    store.applyEvent(identity, 'thinking', '2026-07-10T00:00:00.000Z', { agent: 'claude' });
    const entry = store.get(identity.key);
    expect(entry?.status).toBe('thinking');
    expect(entry?.agent).toBe('claude');
    expect(entry?.pid).toBe(7);
  });
});

describe('StateStore subagent', () => {
  test('upsertSubagent creates a virtual child nested under the parent', () => {
    const store = new StateStore();
    const identity = resolveIdentity([7], '/p', TERMINALS);
    expect(identity).not.toBeNull();
    if (identity === null) return;
    store.applyEvent(identity, 'thinking', '2026-07-10T00:00:00.000Z', {});
    store.upsertSubagent(identity.key, `${identity.key}:subagent:abc`, '2026-07-10T00:00:01.000Z');
    const child = store.get(`${identity.key}:subagent:abc`);
    expect(store.size()).toBe(2);
    expect(child?.parentKey).toBe(identity.key);
    expect(child?.status).toBe('running-tool');
  });

  test('closeSubagentOf closes the most-recent non-done child of a parent', () => {
    const store = new StateStore();
    const identity = resolveIdentity([7], '/p', TERMINALS);
    expect(identity).not.toBeNull();
    if (identity === null) return;
    store.applyEvent(identity, 'thinking', '2026-07-10T00:00:00.000Z', {});

    const olderKey = `${identity.key}:subagent:older`;
    const newerKey = `${identity.key}:subagent:newer`;
    store.upsertSubagent(identity.key, olderKey, '2026-07-10T00:00:01.000Z');
    store.upsertSubagent(identity.key, newerKey, '2026-07-10T00:00:02.000Z');

    expect(store.closeSubagentOf(identity.key, '2026-07-10T00:00:03.000Z')).toBe(true);
    expect(store.get(newerKey)?.status).toBe('done');
    expect(store.get(olderKey)?.status).toBe('running-tool');
  });

  test('closeSubagentOf returns false when no non-done children exist', () => {
    const store = new StateStore();
    const identity = resolveIdentity([7], '/p', TERMINALS);
    expect(identity).not.toBeNull();
    if (identity === null) return;
    store.applyEvent(identity, 'thinking', '2026-07-10T00:00:00.000Z', {});
    store.upsertSubagent(identity.key, `${identity.key}:subagent:abc`, '2026-07-10T00:00:01.000Z');

    expect(store.closeSubagentOf(identity.key, '2026-07-10T00:00:02.000Z')).toBe(true);
    expect(store.closeSubagentOf(identity.key, '2026-07-10T00:00:03.000Z')).toBe(false);
  });
});
