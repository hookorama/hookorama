import { describe, expect, test } from 'vitest';
import { StateStore } from './store.js';
import { resolveIdentity } from '../identity/resolve.js';
import type { OpenTerminal } from '../identity/resolve.js';

const TERMINALS: readonly OpenTerminal[] = [{ pid: 7, cwd: '/p' }];

describe('StateStore', () => {
  test('applyEvent writes a new entry', () => {
    const s = new StateStore();
    const id = resolveIdentity([7], '/p', TERMINALS)!;
    s.applyEvent(id, 'thinking', '2026-07-10T00:00:00.000Z', { agent: 'claude' });
    const e = s.get(id.key);
    expect(e?.status).toBe('thinking');
    expect(e?.agent).toBe('claude');
    expect(e?.pid).toBe(7);
  });

  test('upsertSubagent creates a virtual child nested under the parent', () => {
    const s = new StateStore();
    const id = resolveIdentity([7], '/p', TERMINALS)!;
    s.applyEvent(id, 'thinking', '2026-07-10T00:00:00.000Z', {});
    s.upsertSubagent(id.key, `${id.key}:subagent:abc`, '2026-07-10T00:00:01.000Z');
    const child = s.get(`${id.key}:subagent:abc`);
    expect(s.size()).toBe(2);
    expect(child?.parentKey).toBe(id.key);
    expect(child?.status).toBe('running-tool');
  });

  test('closeSubagentByKey closes the exact child', () => {
    const s = new StateStore();
    const id = resolveIdentity([7], '/p', TERMINALS)!;
    s.applyEvent(id, 'thinking', '2026-07-10T00:00:00.000Z', {});
    const childKey = `${id.key}:subagent:abc`;
    s.upsertSubagent(id.key, childKey, '2026-07-10T00:00:01.000Z');
    expect(s.closeSubagentByKey(childKey, '2026-07-10T00:00:02.000Z')).toBe(true);
    expect(s.get(childKey)?.status).toBe('done');
  });

  test('closeSubagentOf falls back when no exact key', () => {
    const s = new StateStore();
    const id = resolveIdentity([7], '/p', TERMINALS)!;
    s.applyEvent(id, 'thinking', '2026-07-10T00:00:00.000Z', {});
    s.upsertSubagent(id.key, `${id.key}:subagent:abc`, '2026-07-10T00:00:01.000Z');
    s.upsertSubagent(id.key, `${id.key}:subagent:def`, '2026-07-10T00:00:02.000Z');
    expect(s.closeSubagentOf(id.key, '2026-07-10T00:00:03.000Z')).toBe(true);
    // The most recent child (def) is closed.
    expect(s.get(`${id.key}:subagent:def`)?.status).toBe('done');
    expect(s.get(`${id.key}:subagent:abc`)?.status).toBe('running-tool');
  });

  test('clearSubagentChildren drops every child of the parent', () => {
    const s = new StateStore();
    const id = resolveIdentity([7], '/p', TERMINALS)!;
    s.applyEvent(id, 'thinking', '2026-07-10T00:00:00.000Z', {});
    s.upsertSubagent(id.key, `${id.key}:subagent:a`, '2026-07-10T00:00:01.000Z');
    s.upsertSubagent(id.key, `${id.key}:subagent:b`, '2026-07-10T00:00:02.000Z');
    expect(s.clearSubagentChildren(id.key)).toBe(2);
    expect(s.size()).toBe(1);
  });

  test('liveEntries excludes subagent children', () => {
    const s = new StateStore();
    const id = resolveIdentity([7], '/p', TERMINALS)!;
    s.applyEvent(id, 'thinking', '2026-07-10T00:00:00.000Z', {});
    s.upsertSubagent(id.key, `${id.key}:subagent:x`, '2026-07-10T00:00:01.000Z');
    expect(s.liveEntries().map((e) => e.key)).toEqual([id.key]);
  });
});