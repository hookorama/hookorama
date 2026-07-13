import type { ProcessRow, ProcessType, Status } from '@hookorama/client';

export type { Status };

export type NodeType = 'agent' | 'subagent' | 'tool';

export type Origin = 'terminal' | 'vscode' | 'jetbrains' | 'ci';

export type ProcType = ProcessType;

export type Process = ProcessRow;

export interface Project {
  id: string;
  name: string;
  path: string;
  repo?: string;
  branch?: string;
  color: string;
}

export interface Metrics {
  tasks: number;
  toolCalls: number;
  cost: number;
  errors: number;
}

export interface Agent {
  id: string;
  name: string;
  type: NodeType;
  status: Status;
  parentId?: string;
  pid?: number;
  origin: Origin;
  sessionId: string;
  projectId: string;
  model?: string;
  skill?: string;
  currentTask?: string;
  waitingReason?: string;
  lastErrorAt?: number;
  createdAt: number;
  updatedAt: number;
  metrics: Metrics;
}


export type EventType =
  | 'lifecycle.start'
  | 'lifecycle.stop'
  | 'child.spawn'
  | 'tool.call'
  | 'task.begin'
  | 'task.end'
  | 'status.update'
  | 'cost.update'
  | 'skill.used'
  | 'model.call'
  | 'error';

export interface HookEvent {
  id: string;
  ts: number;
  agentId: string;
  projectId?: string;
  sessionId?: string;
  pid?: number;
  type: EventType;
  summary: string;
  payload: Record<string, unknown>;
}

export interface TerminalTab {
  id: string;
  title: string;
  bound?: { kind: 'agent' | 'process' | 'shell'; ref?: string } | undefined;
  buffer: string[];
}

export type NotificationKind = 'waiting-input' | 'error' | 'cost-spike' | 'stalled' | 'approval';

export interface Notification {
  id: string;
  ts: number;
  kind: NotificationKind;
  agentId: string;
  projectId: string;
  message: string;
  severity: 'info' | 'warn' | 'critical';
  ack?: boolean;
}
