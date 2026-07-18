import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProcessRow, WireSnapshot } from '@hookorama/client';
import { isSupervisorRunning } from '../util/supervisor.js';
import { status } from './status.js';

vi.mock('../util/supervisor.js', () => ({
  DEFAULT_HTTP_URL: 'http://127.0.0.1:7354',
  isSupervisorRunning: vi.fn(),
}));

describe('status', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    process.exitCode = 0;
  });

  it('warns and exits when the supervisor is not running', async () => {
    vi.mocked(isSupervisorRunning).mockResolvedValue(false);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { /* suppress */ });

    await status();

    expect(process.exitCode).toBe(1);
    expect(warnSpy).toHaveBeenCalledWith('supervisor is not running');
    warnSpy.mockRestore();
  });

  it('reports a fetch failure and exits', async () => {
    vi.mocked(isSupervisorRunning).mockResolvedValue(true);
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { /* suppress */ });

    await status();

    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith('supervisor status fetch failed:', 'ECONNREFUSED');
    errorSpy.mockRestore();
  });

  it('prints the supervisor summary when everything is available', async () => {
    vi.mocked(isSupervisorRunning).mockResolvedValue(true);

    const snapshot: WireSnapshot = {
      at: '2026-07-18T00:00:00.000Z',
      entries: [
        { key: 'a', status: 'thinking', at: '1', cwd: '/' },
        { key: 'b', status: 'waiting-input', at: '1', cwd: '/' },
        { key: 'c', status: 'error', at: '1', cwd: '/' },
        { key: 'd', status: 'done', at: '1', cwd: '/' },
      ],
    };
    const processes: ProcessRow[] = [
      { pid: 1, ppid: 0, cmd: 'claude', user: 'u', startedAt: 1, type: 'agent' },
    ];

    fetchMock.mockImplementation((url: string) => {
      const path = url;
      if (path.includes('/api/state')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(snapshot) } as Response);
      }
      if (path.includes('/api/processes')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(processes) } as Response);
      }
      return Promise.resolve({ ok: false, status: 404 } as Response);
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { /* suppress */ });

    await status();

    expect(process.exitCode).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith('supervisor: connected');
    expect(warnSpy).toHaveBeenCalledWith('agents: %d', 4);
    expect(warnSpy).toHaveBeenCalledWith('active: %d', 2);
    expect(warnSpy).toHaveBeenCalledWith('waiting-input: %d', 1);
    expect(warnSpy).toHaveBeenCalledWith('errors: %d', 1);
    expect(warnSpy).toHaveBeenCalledWith('processes: %d', 1);
    warnSpy.mockRestore();
  });
});
