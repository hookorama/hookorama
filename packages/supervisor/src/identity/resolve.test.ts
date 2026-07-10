import { describe, expect, test } from 'vitest';
import { normaliseCwd, resolveIdentity, type OpenTerminal } from './resolve.js';

const TERMINALS: readonly OpenTerminal[] = [
  { pid: 100, cwd: '/Users/alice/projects/hookorama' },
  { pid: 200, cwd: '/Users/alice/projects/other' },
];

describe('resolveIdentity', () => {
  test('prefers pid when it matches an open terminal', () => {
    const r = resolveIdentity([100], '/Users/alice/projects/other', TERMINALS);
    expect(r).not.toBeNull();
    expect(r?.kind).toBe('pid');
    expect(r?.key).toBe('pid:100');
    expect(r?.pid).toBe(100);
    expect(r?.cwd).toBe('/Users/alice/projects/hookorama');
  });

  test('falls back to cwd when no pid matches', () => {
    const r = resolveIdentity([999], '/Users/alice/projects/lone', TERMINALS);
    expect(r).not.toBeNull();
    expect(r?.kind).toBe('cwd');
    expect(r?.key).toBe('cwd:/Users/alice/projects/lone');
    expect(r?.pid).toBeUndefined();
  });

  test('walks pidChain and picks the first match', () => {
    const r = resolveIdentity([1, 2, 200, 3], undefined, TERMINALS);
    expect(r?.kind).toBe('pid');
    expect(r?.pid).toBe(200);
  });

  test('returns null when both pidChain and cwd are missing', () => {
    expect(resolveIdentity(undefined, undefined, TERMINALS)).toBeNull();
    expect(resolveIdentity([], '', TERMINALS)).toBeNull();
  });

  test('ignores invalid pids in the chain', () => {
    expect(resolveIdentity([0, -1, NaN, 100], undefined, TERMINALS)?.pid).toBe(100);
  });

  test('session_id is never used as a key (smoke check)', () => {
    const r = resolveIdentity([100], undefined, TERMINALS);
    expect(r?.key).not.toContain('session');
  });
});

describe('normaliseCwd', () => {
  test('strips trailing slashes', () => {
    expect(normaliseCwd('/a/b/')).toBe('/a/b');
    expect(normaliseCwd('/a/b\\')).toBe('/a/b');
  });

  test('lowercases Windows drive letters', () => {
    expect(normaliseCwd('C:\\Users\\Alice')).toBe('c:\\Users\\Alice');
    expect(normaliseCwd('C:/Users/Alice')).toBe('c:/Users/Alice');
  });

  test('leaves POSIX paths untouched', () => {
    expect(normaliseCwd('/Users/alice/Projects/Hookorama')).toBe(
      '/Users/alice/Projects/Hookorama',
    );
  });

  test('returns the empty string unchanged', () => {
    expect(normaliseCwd('')).toBe('');
  });
});