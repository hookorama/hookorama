import { create } from 'zustand';
import type { WireSnapshot, HookEvent as WireHookEvent, ProcessEntry } from '@hookorama/client';
import type { Agent, EventType, HookEvent, Notification, NotificationKind, Origin, Process, Project } from './types.js';

const PROJECT_COLORS = ['#39ff14', '#ffb000', '#22d3ee', '#ff5c8a', '#a78bfa'];

const ORIGINS = new Set<string>(['terminal', 'vscode', 'jetbrains', 'ci']);

interface Bucket {
  ts: number;
  tasks: number;
  toolCalls: number;
  cost: number;
  active: number;
  errors: number;
}

const MAX_BUCKETS = 2000;

function updateBuckets(buckets: Bucket[], agents: Agent[]): Bucket[] {
  const bucket: Bucket = {
    ts: Date.now(),
    tasks: agents.reduce((s, a) => s + a.metrics.tasks, 0),
    toolCalls: agents.reduce((s, a) => s + a.metrics.toolCalls, 0),
    cost: agents.reduce((s, a) => s + a.metrics.cost, 0),
    active: agents.filter((a) => a.status === 'running-tool' || a.status === 'thinking').length,
    errors: agents.filter((a) => a.status === 'error').length,
  };
  return [...buckets, bucket].slice(-MAX_BUCKETS);
}

function updateSkillHistory(agents: Agent[]): Record<string, number> {
  const history: Record<string, number> = {};
  for (const a of agents) {
    if (a.skill) {
      history[a.skill] = (history[a.skill] ?? 0) + a.metrics.tasks;
    }
  }
  return history;
}

function updateModelHistory(agents: Agent[]): Record<string, { calls: number; cost: number }> {
  const history: Record<string, { calls: number; cost: number }> = {};
  for (const a of agents) {
    if (a.model) {
      const prev = history[a.model] ?? { calls: 0, cost: 0 };
      history[a.model] = { calls: prev.calls + a.metrics.toolCalls, cost: prev.cost + a.metrics.cost };
    }
  }
  return history;
}

export type Connection = 'connected' | 'disconnected' | 'error';

interface Store {
  projects: Project[];
  agents: Agent[];
  processes: Process[];
  events: HookEvent[];
  notifications: Notification[];
  scanlines: boolean;
  buckets: Bucket[];
  skillHistory: Record<string, number>;
  modelHistory: Record<string, { calls: number; cost: number }>;
  connection: Connection;

  setConnection: (connection: Connection) => void;
  syncSnapshot: (snapshot: WireSnapshot) => void;
  applyEvent: (event: WireHookEvent) => void;
  toggleScanlines: () => void;
  ackNotification: (id: string) => void;
  clearAcked: () => void;
  setProcesses: (processes: Process[]) => void;
}

function basename(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

function hashString(value: string): number {
  let h = 5381;
  for (let i = 0; i < value.length; i += 1) {
    h = (h * 33 + value.codePointAt(i)!) % 2147483647;
  }
  return h;
}

function projectColor(id: string): string {
  return PROJECT_COLORS[hashString(id) % PROJECT_COLORS.length] ?? '#ffffff';
}

function projectFromEntry(entry: ProcessEntry): Project {
  const id = entry.metadata?.projectId ?? entry.cwd;
  return {
    id,
    name: entry.metadata?.projectId ?? basename(entry.cwd),
    path: entry.cwd,
    color: projectColor(id),
  };
}

function parseOrigin(raw: string | undefined): Origin {
  return raw !== undefined && ORIGINS.has(raw) ? (raw as Origin) : 'terminal';
}

function toAgentOptions(entry: ProcessEntry): Partial<Agent> {
  const options: Partial<Agent> = {};
  if (entry.metadata?.model !== undefined) options.model = entry.metadata.model;
  if (entry.metadata?.skill !== undefined) options.skill = entry.metadata.skill;
  if (entry.metadata?.currentTask !== undefined) options.currentTask = entry.metadata.currentTask;
  if (entry.metadata?.waitingReason !== undefined) options.waitingReason = entry.metadata.waitingReason;
  if (entry.metadata?.lastErrorAt !== undefined) {
    const ts = Date.parse(entry.metadata.lastErrorAt);
    if (!Number.isNaN(ts)) options.lastErrorAt = ts;
  }
  return options;
}

function toAgent(entry: ProcessEntry): Agent {
  const ts = Date.parse(entry.at);
  const updatedAt = Number.isNaN(ts) ? Date.now() : ts;

  return {
    id: entry.key,
    name: entry.agent ?? 'unknown',
    type: entry.parentKey ? 'subagent' : 'agent',
    status: entry.status,
    ...(entry.pid !== undefined ? { pid: entry.pid } : {}),
    origin: parseOrigin(entry.metadata?.origin),
    sessionId: entry.sessionId ?? 'unknown',
    projectId: entry.metadata?.projectId ?? entry.cwd,
    ...toAgentOptions(entry),
    createdAt: updatedAt,
    updatedAt,
    metrics: entry.metadata?.metrics ?? { tasks: 0, toolCalls: 0, cost: 0, errors: 0 },
    ...(entry.parentKey !== undefined ? { parentId: entry.parentKey } : {}),
  };
}

function buildProjects(entries: readonly ProcessEntry[]): Project[] {
  const map = new Map<string, Project>();
  for (const entry of entries) {
    const project = projectFromEntry(entry);
    if (!map.has(project.id)) {
      map.set(project.id, project);
    }
  }
  return Array.from(map.values());
}

function deriveNotifications(agents: readonly Agent[], existing: readonly Notification[]): Notification[] {
  const acked = new Map<string, boolean>();
  for (const n of existing) {
    acked.set(n.id, n.ack ?? false);
  }

  const notifications: Notification[] = [];
  for (const agent of agents) {
    if (agent.status !== 'waiting-input' && agent.status !== 'error') continue;

    const kind: NotificationKind = agent.status === 'error' ? 'error' : 'waiting-input';
    const id = `${agent.id}:${kind}`;
    const message = agent.status === 'error' ? (agent.currentTask ?? 'task failed') : (agent.waitingReason ?? 'input required');

    notifications.push({
      id,
      ts: agent.updatedAt,
      kind,
      agentId: agent.id,
      projectId: agent.projectId,
      severity: agent.status === 'error' ? 'critical' : 'warn',
      message,
      ack: acked.get(id) ?? false,
    });
  }

  return notifications;
}

function mapEvent(event: WireHookEvent): HookEvent {
  const payload = event.payload ?? {};
  const projectId =
    typeof event.projectId === 'string'
      ? event.projectId
      : typeof payload['projectId'] === 'string'
        ? payload['projectId']
        : undefined;

  return {
    id: event.id,
    ts: event.ts,
    agentId: event.key ?? event.agent ?? 'unknown',
    ...(projectId !== undefined ? { projectId } : {}),
    ...(typeof event.sessionId === 'string' ? { sessionId: event.sessionId } : {}),
    ...(typeof event.pid === 'number' ? { pid: event.pid } : {}),
    type: (event.type as EventType) ?? 'status.update',
    summary: event.summary,
    payload,
  };
}

export const useHookoramaStore = create<Store>((set) => ({
  projects: [],
  agents: [],
  processes: [],
  events: [],
  notifications: [],
  scanlines: false,
  buckets: [],
  skillHistory: {},
  modelHistory: {},
  connection: 'disconnected',

  setConnection: (connection) => set({ connection }),

  syncSnapshot: (snapshot) =>
    set((state) => {
      const agents = snapshot.entries.map(toAgent);
      const projects = buildProjects(snapshot.entries);
      const notifications = deriveNotifications(agents, state.notifications);
      return {
        connection: 'connected',
        agents,
        projects,
        notifications,
        buckets: updateBuckets(state.buckets, agents),
        skillHistory: updateSkillHistory(agents),
        modelHistory: updateModelHistory(agents),
      };
    }),

  applyEvent: (event) =>
    set((state) => ({
      events: [...state.events, mapEvent(event)].slice(-100),
    })),

  toggleScanlines: () => set((state) => ({ scanlines: !state.scanlines })),

  ackNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) => (n.id === id ? { ...n, ack: true } : n)),
    })),

  clearAcked: () =>
    set((state) => ({
      notifications: state.notifications.filter((n) => !n.ack),
    })),

  setProcesses: (processes: Process[]) => set({ processes }),
}));

export function selectAgentTree(state: { agents: Agent[] }): Map<string | undefined, Agent[]> {
  const byParent = new Map<string | undefined, Agent[]>();
  for (const a of state.agents) {
    const key = a.parentId;
    let arr = byParent.get(key);
    if (!arr) {
      arr = [];
      byParent.set(key, arr);
    }
    arr.push(a);
  }
  return byParent;
}

export function selectProcessTree(state: { processes: Process[] }): Map<number, Process[]> {
  const byPpid = new Map<number, Process[]>();
  for (const p of state.processes) {
    let arr = byPpid.get(p.ppid);
    if (!arr) {
      arr = [];
      byPpid.set(p.ppid, arr);
    }
    arr.push(p);
  }
  return byPpid;
}
