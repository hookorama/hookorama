/**
 * Shared hook argument parsing for Claude, Devin, and any agent
 * that uses the same `--cwd`, `--model`, `--skill`, `--metrics-*` flags.
 */

import { parseArgs } from 'node:util';
import type { AgentMetadata, HookRequest, Status } from '@hookorama/client';

const VALID_STATUSES = new Set<Status>([
  'idle',
  'thinking',
  'running-tool',
  'waiting-input',
  'done',
  'error',
]);

interface ParsedHookOptions {
  readonly cwd?: string;
  readonly 'agent-name'?: string;
  readonly 'session-id'?: string;
  readonly pid?: string;
  readonly task?: string;
  readonly 'waiting-reason'?: string;
  readonly model?: string;
  readonly skill?: string;
  readonly 'project-id'?: string;
  readonly origin?: string;
  readonly 'metrics-tasks'?: string;
  readonly 'metrics-calls'?: string;
  readonly 'metrics-cost'?: string;
  readonly 'metrics-errors'?: string;
}

const parseOptions = {
  cwd: { type: 'string' as const },
  'agent-name': { type: 'string' as const },
  'session-id': { type: 'string' as const },
  pid: { type: 'string' as const },
  task: { type: 'string' as const },
  'waiting-reason': { type: 'string' as const },
  model: { type: 'string' as const },
  skill: { type: 'string' as const },
  'project-id': { type: 'string' as const },
  origin: { type: 'string' as const },
  'metrics-tasks': { type: 'string' as const },
  'metrics-calls': { type: 'string' as const },
  'metrics-cost': { type: 'string' as const },
  'metrics-errors': { type: 'string' as const },
};

function numberOrThrow(raw: string | undefined, name: string): number | undefined {
  if (raw === undefined || raw.trim().length === 0) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`invalid ${name}: ${raw}`);
  }
  return value;
}

function buildMetadata(values: ParsedHookOptions): AgentMetadata | undefined {
  const tasks = numberOrThrow(values['metrics-tasks'], 'metrics-tasks');
  const toolCalls = numberOrThrow(values['metrics-calls'], 'metrics-calls');
  const cost = numberOrThrow(values['metrics-cost'], 'metrics-cost');
  const errors = numberOrThrow(values['metrics-errors'], 'metrics-errors');

  const metadata: AgentMetadata = {
    ...(values.model !== undefined ? { model: values.model } : {}),
    ...(values.skill !== undefined ? { skill: values.skill } : {}),
    ...(values.task !== undefined ? { currentTask: values.task } : {}),
    ...(values['waiting-reason'] !== undefined ? { waitingReason: values['waiting-reason'] } : {}),
    ...(values['project-id'] !== undefined ? { projectId: values['project-id'] } : {}),
    ...(values.origin !== undefined ? { origin: values.origin } : {}),
    ...(tasks !== undefined || toolCalls !== undefined || cost !== undefined || errors !== undefined
      ? {
          metrics: {
            tasks: tasks ?? 0,
            toolCalls: toolCalls ?? 0,
            cost: cost ?? 0,
            errors: errors ?? 0,
          },
        }
      : {}),
  };

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

/** Parse the tokens after `hook <agent> <status>` into a `HookRequest`. */
export function buildCommonHookRequest(
  agent: string,
  status: string,
  args: readonly string[],
  defaultCwd?: string,
): HookRequest {
  if (!VALID_STATUSES.has(status as Status)) {
    throw new Error(`invalid status: ${status}`);
  }

  const { values } = parseArgs({
    args: [...args],
    options: parseOptions,
    allowPositionals: true,
    strict: false,
  });

  const opts = values as ParsedHookOptions;
  const cwd = opts.cwd ?? defaultCwd ?? process.cwd();

  let pid: number | undefined;
  if (opts.pid !== undefined) {
    const pidValue = Number(opts.pid);
    if (!Number.isInteger(pidValue) || pidValue <= 0) {
      throw new Error(`invalid pid: ${opts.pid}`);
    }
    pid = pidValue;
  }

  const metadata = buildMetadata(opts);
  const hookRequest: HookRequest = {
    status: status as Status,
    cwd,
    agent,
    ...(opts['agent-name'] !== undefined ? { agent: opts['agent-name'] } : {}),
    ...(opts['session-id'] !== undefined ? { sessionId: opts['session-id'] } : {}),
    ...(pid !== undefined ? { pidChain: [pid] } : {}),
    ...(metadata !== undefined ? { metadata } : {}),
  };

  return hookRequest;
}

export { VALID_STATUSES };
