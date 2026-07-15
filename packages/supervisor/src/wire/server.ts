/**
 * Wire server for the supervisor.
 *
 * Serves `GET /api/state`, `POST /api/hook`, and `WebSocket /ws` on
 * a loopback address. All state changes are broadcast to every
 * connected WebSocket client.
 */

import { randomUUID } from 'node:crypto';
import type {
  AgentMetadata,
  HookEvent,
  HookRequest,
  Status,
  WireSnapshot,
  WireMessage,
} from '@hookorama/client';
import { Supervisor } from '../supervisor.js';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const VALID_STATUSES = new Set<Status>([
  'idle',
  'thinking',
  'running-tool',
  'waiting-input',
  'done',
  'error',
]);

function parseOptionalString(raw: unknown): string | undefined | null {
  if (raw === undefined) return undefined;
  return typeof raw === 'string' ? raw : null;
}

function parseStatus(raw: unknown): Status | null {
  if (typeof raw !== 'string') return null;
  if (!VALID_STATUSES.has(raw as Status)) return null;
  return raw as Status;
}

function parseOptionalPidChain(raw: unknown): readonly number[] | undefined | null {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.some((v) => typeof v !== 'number')) {
    return null;
  }
  return raw as number[];
}

function parseOptionalMetadata(raw: unknown): AgentMetadata | undefined | null {
  if (raw === undefined) return undefined;
  if (raw === null || Array.isArray(raw) || typeof raw !== 'object') {
    return null;
  }
  return raw as AgentMetadata;
}

export interface WireServerOptions {
  readonly port?: number;
  readonly hostname?: string;
}

export class WireServer {
  private readonly supervisor: Supervisor;
  private readonly port: number;
  private readonly hostname: string;
  private server: Bun.Server<undefined> | null = null;

  constructor(supervisor: Supervisor, options: WireServerOptions = {}) {
    this.supervisor = supervisor;
    this.port = options.port ?? 7354;
    this.hostname = options.hostname ?? '127.0.0.1';
  }

  start(): Promise<void> {
    this.server = Bun.serve({
      port: this.port,
      hostname: this.hostname,
      fetch: (request, server) => this.handleRequest(request, server),
      websocket: {
        data: undefined,
        open: (ws) => this.onOpen(ws),
        message: () => {
          /* client -> supervisor messages are not used in this PR */
        },
        close: (ws) => this.onClose(ws),
      },
    });
    return Promise.resolve();
  }

  async stop(): Promise<void> {
    await this.server?.stop(true);
    this.server = null;
  }

  url(): URL {
    return this.server!.url;
  }

  private handleRequest(
    request: Request,
    server: Bun.Server<undefined>,
  ): Response | Promise<Response> | undefined {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === '/api/state' && request.method === 'GET') {
      return this.handleState();
    }

    if (url.pathname === '/api/processes' && request.method === 'GET') {
      return this.handleProcesses();
    }

    if (url.pathname === '/api/hook' && request.method === 'POST') {
      return this.handleHook(request);
    }

    if (url.pathname === '/ws' && request.method === 'GET') {
      if (server.upgrade(request)) {
        return undefined;
      }
      return new Response('WebSocket upgrade failed', {
        status: 500,
        headers: CORS_HEADERS,
      });
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    return new Response('Not found', { status: 404, headers: CORS_HEADERS });
  }

  private handleState(): Response {
    return Response.json(this.buildSnapshot(), { headers: CORS_HEADERS });
  }

  private async handleProcesses(): Promise<Response> {
    const processes = await this.supervisor.processes();
    return Response.json(processes, { headers: CORS_HEADERS });
  }

  private async handleHook(request: Request): Promise<Response> {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response('invalid JSON', {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    const hook = this.parseHookRequest(body);
    if (hook === null) {
      return new Response('invalid hook request', {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    const identity = this.supervisor.applyHook(hook);
    if (identity === null) {
      return new Response('unresolvable identity', {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    this.broadcastEvent(this.buildEvent(identity, hook));
    this.broadcastSnapshot();

    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  private parseHookRequest(body: unknown): HookRequest | null {
    if (body === null || typeof body !== 'object') {
      return null;
    }

    const value = body as Record<string, unknown>;
    const status = parseStatus(value['status']);
    if (status === null) return null;

    const agent = parseOptionalString(value['agent']);
    if (agent === null) return null;
    const sessionId = parseOptionalString(value['sessionId']);
    if (sessionId === null) return null;
    const cwd = parseOptionalString(value['cwd']);
    if (cwd === null) return null;
    const at = parseOptionalString(value['at']);
    if (at === null) return null;

    const pidChain = parseOptionalPidChain(value['pidChain']);
    if (pidChain === null) return null;

    const metadata = parseOptionalMetadata(value['metadata']);
    if (metadata === null) return null;

    return {
      status,
      ...(agent !== undefined ? { agent } : {}),
      ...(sessionId !== undefined ? { sessionId } : {}),
      ...(cwd !== undefined ? { cwd } : {}),
      ...(at !== undefined ? { at } : {}),
      ...(pidChain !== undefined ? { pidChain } : {}),
      ...(metadata !== undefined ? { metadata } : {}),
    };
  }

  private onOpen(ws: Bun.ServerWebSocket<undefined>): void {
    ws.subscribe('broadcast');
    this.sendSnapshot(ws);
  }

  private onClose(ws: Bun.ServerWebSocket<undefined>): void {
    ws.unsubscribe('broadcast');
  }

  private sendSnapshot(ws: Bun.ServerWebSocket<undefined>): void {
    const message: WireMessage = {
      type: 'snapshot',
      data: this.buildSnapshot(),
    };
    ws.send(JSON.stringify(message));
  }

  private broadcastSnapshot(): void {
    const message: WireMessage = {
      type: 'snapshot',
      data: this.buildSnapshot(),
    };
    this.server?.publish('broadcast', JSON.stringify(message));
  }

  private broadcastEvent(event: HookEvent): void {
    const message: WireMessage = {
      type: 'event',
      data: event,
    };
    this.server?.publish('broadcast', JSON.stringify(message));
  }

  private buildSnapshot(): WireSnapshot {
    return {
      entries: this.supervisor.snapshot(),
      at: new Date().toISOString(),
    };
  }

  private buildEvent(
    identity: { readonly key: string; readonly pid?: number },
    request: HookRequest,
  ): HookEvent {
    return {
      id: randomUUID(),
      ts: Date.now(),
      key: identity.key,
      type: request.status,
      summary: `${request.agent ?? 'unknown agent'} is ${request.status}`,
      ...(request.agent !== undefined ? { agent: request.agent } : {}),
      ...(request.sessionId !== undefined ? { sessionId: request.sessionId } : {}),
      ...(identity.pid !== undefined ? { pid: identity.pid } : {}),
      ...(request.metadata !== undefined
        ? { payload: request.metadata as Record<string, unknown> }
        : {}),
    };
  }
}
