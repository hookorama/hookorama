import { create } from 'zustand';
import type { WireSnapshot, HookEvent as WireHookEvent, ProcessEntry } from '@hookorama/client';
import type { Agent, EventType, HookEvent, Metrics, Notification, NotificationKind, Origin, Process, Project } from './types.js';

const PROJECT_COLORS = ['#39ff14', '#ffb000', '#22d3ee', '#ff5c8a', '#a78bfa'];

const ORIGINS = new Set<string>(['terminal', 'vscode', 'jetbrains', 'ci']);

interface ProjectMetrics {
  tasks: number;
  toolCalls: number;
  cost: number;
  active: number;
  errors: number;
}

interface AgentTotal {
  projectId: string;
  metrics: Metrics;
}

interface Bucket {
  id: number;
  ts: number;
  tasks: number;
  toolCalls: number;
  cost: number;
  active: number;
  errors: number;
  byProject: Map<string, ProjectMetrics>;
}

const MAX_BUCKETS = 2000;

function emptyProjectMetrics(): ProjectMetrics {
  return { tasks: 0, toolCalls: 0, cost: 0, active: 0, errors: 0 };
}

function updateBuckets(
  buckets: Bucket[],
  agents: Agent[],
  agentTotals: Record<string, AgentTotal>,
  nextBucketId: number,
): Bucket[] {
  const byProject = new Map<string, ProjectMetrics>();
  const totals = emptyProjectMetrics();

  // Cumulative totals are built from every agent we have ever seen so that
  // completed agents still contribute to range-based KPIs.
  for (const { projectId, metrics } of Object.values(agentTotals)) {
    let pm = byProject.get(projectId);
    if (!pm) {
      pm = emptyProjectMetrics();
      byProject.set(projectId, pm);
    }
    pm.tasks += metrics.tasks;
    pm.toolCalls += metrics.toolCalls;
    pm.cost += metrics.cost;
    pm.errors += metrics.errors;

    totals.tasks += metrics.tasks;
    totals.toolCalls += metrics.toolCalls;
    totals.cost += metrics.cost;
    totals.errors += metrics.errors;
  }

  // Active counts reflect the currently running/thinking agents only.
  for (const a of agents) {
    if (a.status === 'running-tool' || a.status === 'thinking') {
      const pm = byProject.get(a.projectId);
      if (pm) pm.active += 1;
      totals.active += 1;
    }
  }

  const bucket: Bucket = {
    id: nextBucketId,
    ts: Date.now(),
    tasks: totals.tasks,
    toolCalls: totals.toolCalls,
    cost: totals.cost,
    active: totals.active,
    errors: totals.errors,
    byProject,
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
  notificationAcks: Set<string>;
  scanlines: boolean;
  buckets: Bucket[];
  agentTotals: Record<string, AgentTotal>;
  nextBucketId: number;
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
  const normalized = path.replaceAll('\\', '/');
  const idx = normalized.lastIndexOf('/');
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

function hashString(value: string): number {
  let h = 5381;
  for (let i = 0; i < value.length; i += 1) {
    h = (h * 33 + (value.codePointAt(i) ?? 0)) % 2147483647;
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

function sameProcessSession(entry: ProcessEntry, previous: Agent): boolean {
  // Only carry error timestamps forward when the snapshot row is confirmed
  // to belong to the same process/session, otherwise a reused PID can hide
  // a new failure behind an already-acknowledged notification. The 'unknown'
  // sentinel means the previous row had no sessionId, so we cannot confirm
  // a match and must treat the current row as a new process/session.
  if (entry.sessionId === undefined) return false;
  if (previous.sessionId === 'unknown') return false;
  return entry.sessionId === previous.sessionId;
}

function deriveLastErrorAt(entry: ProcessEntry, updatedAt: number, previous?: Agent): number | undefined {
  let parsed: number | undefined;
  if (entry.metadata?.lastErrorAt !== undefined) {
    const ts = Date.parse(entry.metadata.lastErrorAt);
    if (!Number.isNaN(ts)) parsed = ts;
  }

  if (parsed === undefined && entry.status === 'error') {
    if (previous?.status === 'error' && sameProcessSession(entry, previous)) {
      parsed = previous.lastErrorAt ?? updatedAt;
    } else {
      parsed = updatedAt;
    }
  }
  return parsed;
}

function toAgentOptions(entry: ProcessEntry, updatedAt: number, previous?: Agent): Partial<Agent> {
  const options: Partial<Agent> = {};
  if (entry.metadata?.model !== undefined) options.model = entry.metadata.model;
  if (entry.metadata?.skill !== undefined) options.skill = entry.metadata.skill;
  if (entry.metadata?.currentTask !== undefined) options.currentTask = entry.metadata.currentTask;
  if (entry.metadata?.waitingReason !== undefined) options.waitingReason = entry.metadata.waitingReason;
  const lastErrorAt = deriveLastErrorAt(entry, updatedAt, previous);
  if (lastErrorAt !== undefined) options.lastErrorAt = lastErrorAt;
  return options;
}

function toAgent(entry: ProcessEntry, previous?: Agent): Agent {
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
    ...toAgentOptions(entry, updatedAt, previous),
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

function deriveNotifications(
  agents: readonly Agent[],
  state: { notifications: readonly Notification[]; notificationAcks: ReadonlySet<string> },
): Notification[] {
  const acked = new Set<string>(state.notificationAcks);
  for (const n of state.notifications) {
    if (n.ack) {
      acked.add(n.id);
    }
  }

  const notifications: Notification[] = [];
  for (const agent of agents) {
    if (agent.status !== 'waiting-input' && agent.status !== 'error') continue;

    const kind: NotificationKind = agent.status === 'error' ? 'error' : 'waiting-input';
    const occurrence = kind === 'error' ? agent.lastErrorAt : undefined;
    const id = occurrence !== undefined ? `${agent.id}:${kind}:${occurrence}` : `${agent.id}:${kind}`;
    const message =
      agent.status === 'error' ? (agent.currentTask ?? 'task failed') : (agent.waitingReason ?? 'input required');

    notifications.push({
      id,
      ts: agent.updatedAt,
      kind,
      agentId: agent.id,
      projectId: agent.projectId,
      severity: agent.status === 'error' ? 'critical' : 'warn',
      message,
      ack: acked.has(id),
    });
  }

  return notifications;
}

function mapEvent(event: WireHookEvent): HookEvent {
  const payload = event.payload ?? {};
  let projectId: string | undefined;
  if (typeof event.projectId === 'string') {
    projectId = event.projectId;
  } else if (typeof payload['projectId'] === 'string') {
    projectId = payload['projectId'];
  }

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
  notificationAcks: new Set<string>(),
  scanlines: false,
  buckets: [],
  agentTotals: {},
  nextBucketId: 0,
  skillHistory: {},
  modelHistory: {},
  connection: 'disconnected',

  setConnection: (connection) => {
    set({ connection });
  },

  syncSnapshot: (snapshot) => {
    set((state) => {
      const previousById = new Map(state.agents.map((a) => [a.id, a]));
      const agents = snapshot.entries.map((entry) => toAgent(entry, previousById.get(entry.key)));
      const projects = buildProjects(snapshot.entries);
      const notifications = deriveNotifications(agents, {
        notifications: state.notifications,
        notificationAcks: state.notificationAcks,
      });
      const agentTotals: Record<string, AgentTotal> = { ...state.agentTotals };
      for (const a of agents) {
        agentTotals[a.id] = { projectId: a.projectId, metrics: a.metrics };
      }
      const nextBucketId = state.nextBucketId + 1;
      return {
        connection: 'connected',
        agents,
        projects,
        notifications,
        buckets: updateBuckets(state.buckets, agents, agentTotals, nextBucketId),
        agentTotals,
        nextBucketId,
        skillHistory: updateSkillHistory(agents),
        modelHistory: updateModelHistory(agents),
      };
    });
  },

  applyEvent: (event) => {
    set((state) => ({
      events: [...state.events, mapEvent(event)].slice(-100),
    }));
  },

  toggleScanlines: () => {
    set((state) => ({ scanlines: !state.scanlines }));
  },

  ackNotification: (id) => {
    set((state) => ({
      notifications: state.notifications.map((n) => (n.id === id ? { ...n, ack: true } : n)),
      notificationAcks: new Set([...state.notificationAcks, id]),
    }));
  },

  clearAcked: () => {
    set((state) => {
      const ackedIds = new Set<string>();
      for (const n of state.notifications) {
        if (n.ack) ackedIds.add(n.id);
      }
      return {
        notifications: state.notifications.filter((n) => !n.ack),
        notificationAcks: new Set([...state.notificationAcks, ...ackedIds]),
      };
    });
  },

  setProcesses: (processes: Process[]) => {
    set({ processes });
  },
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
