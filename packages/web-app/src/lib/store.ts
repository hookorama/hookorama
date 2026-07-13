import { create } from 'zustand';
import type { WireSnapshot, HookEvent as WireHookEvent, ProcessEntry } from '@hookorama/client';
import type { Agent, EventType, HookEvent, Notification, NotificationKind, Origin, Process, Project, TerminalTab } from './types.js';

let idCounter = 0;
const uid = (prefix: string): string => {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
};

const SEED_PROJECTS: Project[] = [
  {
    id: 'proj_hookorama',
    name: 'hookorama',
    path: '~/code/hookorama',
    repo: 'github.com/acme/hookorama',
    branch: 'main',
    color: '#39ff14',
  },
  {
    id: 'proj_paygrid',
    name: 'paygrid-api',
    path: '~/code/paygrid-api',
    repo: 'github.com/acme/paygrid-api',
    branch: 'feat/webhooks',
    color: '#ffb000',
  },
  {
    id: 'proj_atlas',
    name: 'atlas-ui',
    path: '~/work/atlas-ui',
    repo: 'gitlab.com/acme/atlas-ui',
    branch: 'release/2.4',
    color: '#22d3ee',
  },
  {
    id: 'proj_infra',
    name: 'infra-terraform',
    path: '~/ops/infra',
    repo: 'github.com/acme/infra',
    branch: 'main',
    color: '#ff5c8a',
  },
  {
    id: 'proj_scratch',
    name: 'scratch',
    path: '~/tmp/scratch',
    branch: '-',
    color: '#a78bfa',
  },
];

const SEED_AGENTS: Agent[] = [
  {
    id: 'agent_1',
    name: 'claude',
    type: 'agent',
    status: 'waiting-input',
    pid: 3001,
    origin: 'terminal',
    sessionId: 'sess_1',
    projectId: 'proj_hookorama',
    model: 'claude-sonnet-4.5',
    skill: 'refactor',
    currentTask: 'refactor mock store',
    waitingReason: 'approve destructive `rm -rf dist/`?',
    createdAt: Date.now() - 1_000_000,
    updatedAt: Date.now() - 60_000,
    metrics: { tasks: 12, toolCalls: 47, cost: 1.234, errors: 0 },
  },
  {
    id: 'agent_2',
    name: 'codex',
    type: 'agent',
    status: 'running-tool',
    pid: 3002,
    origin: 'vscode',
    sessionId: 'sess_2',
    projectId: 'proj_paygrid',
    model: 'gpt-5',
    skill: 'debug',
    currentTask: 'implement webhook signer',
    createdAt: Date.now() - 900_000,
    updatedAt: Date.now() - 30_000,
    metrics: { tasks: 8, toolCalls: 32, cost: 0.987, errors: 0 },
  },
  {
    id: 'agent_3',
    name: 'devin',
    type: 'agent',
    status: 'error',
    pid: 3003,
    origin: 'ci',
    sessionId: 'sess_3',
    projectId: 'proj_infra',
    model: 'claude-sonnet-4.5',
    skill: 'planning',
    currentTask: 'terraform plan drift',
    createdAt: Date.now() - 800_000,
    updatedAt: Date.now() - 20_000,
    metrics: { tasks: 5, toolCalls: 19, cost: 0.456, errors: 1 },
  },
  {
    id: 'agent_4',
    name: 'claude',
    type: 'agent',
    status: 'running-tool',
    pid: 3004,
    origin: 'vscode',
    sessionId: 'sess_4',
    projectId: 'proj_atlas',
    model: 'claude-sonnet-4.5',
    skill: 'research',
    currentTask: 'design tokens migration',
    createdAt: Date.now() - 700_000,
    updatedAt: Date.now() - 10_000,
    metrics: { tasks: 15, toolCalls: 62, cost: 1.876, errors: 0 },
  },
  {
    id: 'agent_5',
    name: 'aider',
    type: 'agent',
    status: 'idle',
    pid: 3005,
    origin: 'terminal',
    sessionId: 'sess_5',
    projectId: 'proj_scratch',
    model: 'gpt-5',
    skill: 'test-gen',
    currentTask: 'prototype parser',
    createdAt: Date.now() - 600_000,
    updatedAt: Date.now() - 5_000,
    metrics: { tasks: 3, toolCalls: 8, cost: 0.123, errors: 0 },
  },
  {
    id: 'agent_6',
    name: 'claude-worker-1',
    type: 'subagent',
    status: 'thinking',
    parentId: 'agent_1',
    pid: 3006,
    origin: 'terminal',
    sessionId: 'sess_1',
    projectId: 'proj_hookorama',
    model: 'claude-sonnet-4.5',
    skill: 'scan repo',
    currentTask: 'scan repo',
    createdAt: Date.now() - 500_000,
    updatedAt: Date.now() - 2_000,
    metrics: { tasks: 2, toolCalls: 14, cost: 0.234, errors: 0 },
  },
];

const SEED_NOTIFICATIONS: Notification[] = [
  {
    id: 'ntf_1',
    ts: Date.now() - 120_000,
    kind: 'waiting-input',
    agentId: 'agent_1',
    projectId: 'proj_hookorama',
    severity: 'warn',
    message: 'approve destructive `rm -rf dist/`?',
  },
  {
    id: 'ntf_2',
    ts: Date.now() - 90_000,
    kind: 'error',
    agentId: 'agent_3',
    projectId: 'proj_infra',
    severity: 'critical',
    message: 'error in terraform plan drift',
  },
  {
    id: 'ntf_3',
    ts: Date.now() - 60_000,
    kind: 'approval',
    agentId: 'agent_2',
    projectId: 'proj_paygrid',
    severity: 'info',
    message: 'waiting for webhook approval',
  },
];

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

type Connection = 'connected' | 'disconnected' | 'error' | 'mock';

interface Store {
  projects: Project[];
  agents: Agent[];
  processes: Process[];
  events: HookEvent[];
  notifications: Notification[];
  terminals: TerminalTab[];
  activeTerminal: string | null;
  dockOpen: boolean;
  dockHeight: number;
  paused: boolean;
  tickSpeed: number;
  tickCount: number;
  scanlines: boolean;
  buckets: Bucket[];
  skillHistory: Record<string, number>;
  toolHistory: Record<string, { calls: number; errors: number }>;
  modelHistory: Record<string, { calls: number; cost: number }>;
  connection: Connection;

  setConnection: (connection: Connection) => void;
  syncSnapshot: (snapshot: WireSnapshot) => void;
  applyEvent: (event: WireHookEvent) => void;
  togglePause: () => void;
  setSpeed: (ms: number) => void;
  toggleScanlines: () => void;
  addTerminal: (tab: Partial<TerminalTab>) => string;
  closeTerminal: (id: string) => void;
  setActiveTerminal: (id: string) => void;
  appendTerminal: (id: string, line: string) => void;
  toggleDock: () => void;
  setDockHeight: (height: number) => void;
  focusAgent: (agentId: string) => void;
  ackNotification: (id: string) => void;
  clearAcked: () => void;
  tick: () => void;
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
    type: 'status.update' as EventType,
    summary: event.summary,
    payload,
  };
}

export const useHookoramaStore = create<Store>((set, get) => ({
  projects: SEED_PROJECTS,
  agents: SEED_AGENTS,
  processes: [],
  events: [],
  notifications: SEED_NOTIFICATIONS,
  terminals: [],
  activeTerminal: null,
  dockOpen: false,
  dockHeight: 200,
  paused: false,
  tickSpeed: 1200,
  tickCount: 0,
  scanlines: false,
  buckets: [],
  skillHistory: {},
  toolHistory: {},
  modelHistory: {},
  connection: 'mock',

  setConnection: (connection) => set({ connection }),

  syncSnapshot: (snapshot) =>
    set((state) => {
      const agents = snapshot.entries.map(toAgent);
      const projects = buildProjects(snapshot.entries);
      const notifications = deriveNotifications(agents, state.notifications);
      return { connection: 'connected', agents, projects, notifications };
    }),

  applyEvent: (event) =>
    set((state) => ({
      events: [...state.events, mapEvent(event)].slice(-100),
    })),

  togglePause: () => set((state) => ({ paused: !state.paused })),
  setSpeed: (ms: number) => set({ tickSpeed: ms }),
  toggleScanlines: () => set((state) => ({ scanlines: !state.scanlines })),

  addTerminal: (tab) => {
    const id = uid('term');
    const bound = tab.bound
      ? { kind: tab.bound.kind, ...(tab.bound.ref !== undefined ? { ref: tab.bound.ref } : {}) }
      : undefined;
    const terminal: TerminalTab = {
      id,
      title: tab.title ?? `shell #${get().terminals.length + 1}`,
      bound,
      buffer: tab.buffer ?? [],
    };
    set((state) => ({ terminals: [...state.terminals, terminal], activeTerminal: id }));
    return id;
  },

  closeTerminal: (id) =>
    set((state) => {
      const terminals = state.terminals.filter((t) => t.id !== id);
      return {
        terminals,
        activeTerminal: state.activeTerminal === id ? (terminals[0]?.id ?? null) : state.activeTerminal,
      };
    }),

  setActiveTerminal: (id) => set({ activeTerminal: id }),

  appendTerminal: (id, line) =>
    set((state) => ({
      terminals: state.terminals.map((t) => (t.id === id ? { ...t, buffer: [...t.buffer, line] } : t)),
    })),

  toggleDock: () => set((state) => ({ dockOpen: !state.dockOpen })),
  setDockHeight: (height) => set({ dockHeight: height }),

  focusAgent: (agentId) => {
    const agent = get().agents.find((a) => a.id === agentId);
    const title = agent ? `${agent.name} (${agent.id})` : `agent ${agentId}`;
    get().addTerminal({ title, bound: { kind: 'agent', ref: agentId } });
    set({ dockOpen: true });
  },

  ackNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) => (n.id === id ? { ...n, ack: true } : n)),
    })),

  clearAcked: () =>
    set((state) => ({
      notifications: state.notifications.filter((n) => !n.ack),
    })),

  tick: () => {
    set((state) => {
      if (state.paused) return state;
      return {
        tickCount: state.tickCount + 1,
        buckets: updateBuckets(state.buckets, state.agents),
        skillHistory: updateSkillHistory(state.agents),
        modelHistory: updateModelHistory(state.agents),
      };
    });
  },

  setProcesses: (processes: Process[]) => set({ processes }),
}));

export function selectAgentTree(state: { agents: Agent[] }): Map<string | undefined, Agent[]> {
  const byParent = new Map<string | undefined, Agent[]>();
  for (const a of state.agents) {
    const key = a.parentId;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(a);
  }
  return byParent;
}

export function selectProcessTree(state: { processes: Process[] }): Map<number, Process[]> {
  const byPpid = new Map<number, Process[]>();
  for (const p of state.processes) {
    if (!byPpid.has(p.ppid)) byPpid.set(p.ppid, []);
    byPpid.get(p.ppid)!.push(p);
  }
  return byPpid;
}
