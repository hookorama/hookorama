import type { HookRequest, ProcessEntry, ProcessRow, Status, WireSnapshot } from '@hookorama/client';

const baseUrl = process.env['E2E_SUPERVISOR_URL'] ?? 'http://127.0.0.1:7354';

export async function resetState(): Promise<void> {
  const response = await fetch(`${baseUrl}/api/reset`, { method: 'POST' });
  if (!response.ok) {
    throw new Error(`POST /api/reset failed: ${response.status}. Ensure the supervisor is started with E2E_ALLOW_RESET=1.`);
  }
}

export async function getSnapshot(timeoutMs = 5000): Promise<WireSnapshot> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/api/state`, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`GET /api/state failed: ${response.status}`);
    }
    return (await response.json()) as WireSnapshot;
  } finally {
    clearTimeout(timer);
  }
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

export async function getProcesses(): Promise<ProcessRow[]> {
  const response = await fetch(`${baseUrl}/api/processes`);
  if (!response.ok) {
    throw new Error(`GET /api/processes failed: ${response.status}`);
  }
  return (await response.json()) as ProcessRow[];
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
    const remaining = deadline - Date.now();
    const snapshotTimeout = Math.min(5000, Math.max(0, remaining));
    let snapshot: WireSnapshot;
    try {
      snapshot = await getSnapshot(snapshotTimeout);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        continue;
      }
      throw error;
    }
    const entry = findAgent(snapshot, sessionId);
    if (entry !== undefined && entry.status === status) {
      return entry;
    }
    last = entry;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`agent ${sessionId} did not reach ${status} in time; last=${JSON.stringify(last)}`);
}
