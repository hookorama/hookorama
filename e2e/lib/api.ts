import type { HookRequest, ProcessEntry, Status, WireSnapshot } from '@hookorama/client';

const baseUrl = process.env['E2E_SUPERVISOR_URL'] ?? 'http://127.0.0.1:7354';

export async function resetState(): Promise<void> {
  const response = await fetch(`${baseUrl}/api/reset`, { method: 'POST' });
  if (!response.ok && response.status !== 404) {
    throw new Error(`POST /api/reset failed: ${response.status}`);
  }
}

export async function getSnapshot(): Promise<WireSnapshot> {
  const response = await fetch(`${baseUrl}/api/state`);
  if (!response.ok) {
    throw new Error(`GET /api/state failed: ${response.status}`);
  }
  return (await response.json()) as WireSnapshot;
}

export async function sendHook(request: HookRequest): Promise<void> {
  const response = await fetch(`${baseUrl}/api/hook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error(`POST /api/hook failed: ${response.status}`);
  }
}

export async function getProcesses(): Promise<unknown[]> {
  const response = await fetch(`${baseUrl}/api/processes`);
  if (!response.ok) {
    throw new Error(`GET /api/processes failed: ${response.status}`);
  }
  return (await response.json()) as unknown[];
}

export function findAgent(snapshot: WireSnapshot, sessionId: string): ProcessEntry | undefined {
  return snapshot.entries.find((entry: ProcessEntry) => entry.sessionId === sessionId);
}

export async function waitForAgent(
  sessionId: string,
  status: Status,
  timeoutMs = 15000,
): Promise<ProcessEntry> {
  const deadline = Date.now() + timeoutMs;
  let last: ProcessEntry | undefined;

  while (Date.now() < deadline) {
    const snapshot = await getSnapshot();
    const entry = findAgent(snapshot, sessionId);
    if (entry !== undefined && entry.status === status) {
      return entry;
    }
    last = entry;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`agent ${sessionId} did not reach ${status} in time; last=${JSON.stringify(last)}`);
}
