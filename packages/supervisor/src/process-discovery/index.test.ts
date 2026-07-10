import { describe, expect, test } from 'vitest';
import { parseWmicCsv } from './index.js';

describe('parseWmicCsv', () => {
  test('parses rows with the leading Node column', () => {
    const lines = [
      'Node,Name,ParentProcessId,ProcessId',
      'HOST1,explorer.exe,1234,5678',
      'HOST1,cmd.exe,5678,9012',
    ];
    const rows = parseWmicCsv(lines);
    expect(rows).toEqual([
      { pid: 5678, ppid: 1234, command: 'explorer.exe' },
      { pid: 9012, ppid: 5678, command: 'cmd.exe' },
    ]);
  });

  test('ignores rows with non-numeric pid/ppid', () => {
    const lines = [
      'Node,Name,ParentProcessId,ProcessId',
      'HOST1,explorer.exe,foo,5678',
      'HOST1,cmd.exe,5678,bar',
      'HOST1,powershell.exe,1,42',
    ];
    expect(parseWmicCsv(lines)).toEqual([{ pid: 42, ppid: 1, command: 'powershell.exe' }]);
  });

  test('returns empty when the header is missing required columns', () => {
    const lines = ['Node,Name', 'HOST1,explorer.exe'];
    expect(parseWmicCsv(lines)).toEqual([]);
  });

  test('returns empty when there is no data', () => {
    expect(parseWmicCsv(['Node,Name,ParentProcessId,ProcessId'])).toEqual([]);
    expect(parseWmicCsv([])).toEqual([]);
  });
});
