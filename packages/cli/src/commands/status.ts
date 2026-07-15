/**
 * `hookorama status` command.
 */

import type { ProcessRow, WireSnapshot } from '@hookorama/client';
import { isSupervisorRunning } from '../util/supervisor.js';

const DEFAULT_HTTP_URL = 'http://127.0.0.1:7354';

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${DEFAULT_HTTP_URL}${path}`);
  if (!response.ok) {
    throw new Error(`${path} failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function status(): Promise<void> {
  if (!(await isSupervisorRunning())) {
    console.warn('supervisor is not running');
    process.exitCode = 1;
    return;
  }

  const [snapshot, processes] = await Promise.all([
    fetchJson<WireSnapshot>('/api/state').catch(() => ({ entries: [], at: new Date().toISOString() })),
    fetchJson<ProcessRow[]>('/api/processes').catch(() => []),
  ]);

  const entries = snapshot.entries;
  const active = entries.filter((e) => e.status !== 'done' && e.status !== 'error').length;
  const waiting = entries.filter((e) => e.status === 'waiting-input').length;
  const errors = entries.filter((e) => e.status === 'error').length;

  console.warn('supervisor: connected');
  console.warn('agents: %d', entries.length);
  console.warn('active: %d', active);
  console.warn('waiting-input: %d', waiting);
  console.warn('errors: %d', errors);
  console.warn('processes: %d', processes.length);
}
