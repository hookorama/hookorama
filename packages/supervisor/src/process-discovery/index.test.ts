import { describe, expect, test } from 'vitest';
import type { ProcessInfo } from '@sysutils/ps';
import { pickDiscovery, SysutilsPsDiscovery, toProcessRow } from './index.js';

describe('toProcessRow', () => {
  test('maps a full ProcessInfo to a ProcessRow', () => {
    const info: ProcessInfo = {
      pid: 42,
      ppid: 1,
      name: 'sh',
      command: '/bin/sh -c foo',
      user: 'alice',
      startedAt: 1704067200000,
    };
    expect(toProcessRow(info)).toEqual({
      pid: 42,
      ppid: 1,
      command: '/bin/sh -c foo',
      user: 'alice',
      startedAt: 1704067200000,
    });
  });

  test('falls back command to name when command is null', () => {
    const info: ProcessInfo = {
      pid: 7,
      ppid: 0,
      name: 'kernel-worker',
      command: null,
    };
    expect(toProcessRow(info)).toEqual({
      pid: 7,
      ppid: 0,
      command: 'kernel-worker',
    });
  });

  test('defaults command to empty string when both command and name are missing', () => {
    const info: ProcessInfo = { pid: 99, ppid: 1, name: '' };
    expect(toProcessRow(info)).toEqual({ pid: 99, ppid: 1, command: '' });
  });

  test('omits user and startedAt when they are null', () => {
    const info: ProcessInfo = {
      pid: 123,
      ppid: 1,
      name: 'node',
      command: 'node app.js',
      user: null,
      startedAt: null,
    };
    const row = toProcessRow(info);
    expect(row.user).toBeUndefined();
    expect(row.startedAt).toBeUndefined();
  });
});

describe('pickDiscovery', () => {
  test('returns a SysutilsPsDiscovery for supported platforms', () => {
    expect(pickDiscovery('linux')).toBeInstanceOf(SysutilsPsDiscovery);
    expect(pickDiscovery('darwin')).toBeInstanceOf(SysutilsPsDiscovery);
    expect(pickDiscovery('win32')).toBeInstanceOf(SysutilsPsDiscovery);
  });

  test('returns null for unsupported platforms', () => {
    expect(pickDiscovery('freebsd')).toBeNull();
    expect(pickDiscovery('aix')).toBeNull();
  });
});
