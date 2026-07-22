/**
 * Wire server for the supervisor.
 *
 * Serves `GET /api/state`, `POST /api/hook`, `POST /api/terminals`,
 * and `WebSocket /ws` on a loopback address. All state changes are
 * broadcast to every connected WebSocket client.
 *
 * Implementation uses Node's native `http` module and the `ws` package so
 * the supervisor can run on any Node-compatible TypeScript runtime.
 */

import { randomUUID } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';
import type {
  AgentMetadata,
  HookEvent,
  HookRequest,
  Status,
  WireSnapshot,
  WireMessage,
} from '@hookorama/client';
import { Supervisor } from '../supervisor.js';
import type { OpenTerminal } from '../identity/resolve.js';

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
  private httpServer: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private readonly clients = new Set<WebSocket>();

  constructor(supervisor: Supervisor, options: WireServerOptions = {}) {
    this.supervisor = supervisor;
    this.port = options.port ?? 7354;
    this.hostname = options.hostname ?? '127.0.0.1';
  }

  start(): Promise<void> {
    const wss = new WebSocketServer({ noServer: true });
    this.wss = wss;

    wss.on('connection', (ws) => {
      this.onOpen(ws);
      ws.on('close', () => {
        this.onClose(ws);
      });
      ws.on('error', (err) => {
        console.warn('websocket error:', err);
      });
    });

    const httpServer = http.createServer(async (req, res) => {
      try {
        const body = await this.readBody(req);
        const request = this.toRequest(req, body);
        const response = await this.handleRequest(request, req.socket.remoteAddress);
        await this.sendResponse(res, response);
      } catch (err) {
        console.warn('http handler error:', err);
        if (!res.headersSent) {
          res.writeHead(500, { 'content-type': 'text/plain' });
        }
        if (!res.writableEnded) {
          res.end('Internal server error');
        }
      }
    });

    httpServer.on('upgrade', (request, socket, head) => {
      const url = new URL(
        request.url ?? '/',
        `http://${request.headers.host ?? `${this.hostname}:${this.port}`}`,
      );
      if (url.pathname !== '/ws') {
        socket.destroy();
        return;
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    });

    this.httpServer = httpServer;

    return new Promise((resolve, reject) => {
      const onError = (err: Error): void => {
        httpServer.off('error', onError);
        reject(err);
      };
      httpServer.once('error', onError);
      httpServer.listen(this.port, this.hostname, () => {
        httpServer.off('error', onError);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      let pending = 0;
      const done = (err?: Error): void => {
        if (err) {
          reject(err);
          return;
        }
        pending -= 1;
        if (pending === 0) {
          resolve();
        }
      };

      this.clients.clear();

      if (this.wss !== null) {
        pending += 1;
        this.wss.close(done);
        this.wss = null;
      }
      if (this.httpServer !== null) {
        pending += 1;
        this.httpServer.close(() => done());
        this.httpServer = null;
      }

      if (pending === 0) {
        resolve();
      }
    });
  }

  url(): URL {
    if (this.httpServer === null) {
      throw new Error('WireServer is not started');
    }
    const address = this.httpServer.address();
    if (address === null || typeof address === 'string') {
      throw new Error('WireServer is not listening on TCP');
    }
    return new URL(`http://${this.hostname}:${(address as AddressInfo).port}/`);
  }

  private toRequest(req: http.IncomingMessage, body: Buffer | undefined): Request {
    const host = req.headers.host ?? `${this.hostname}:${this.port}`;
    const url = new URL(req.url ?? '/', `http://${host}`).toString();
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        for (const v of value) {
          headers.append(key, v);
        }
      } else {
        headers.set(key, value);
      }
    }

    const method = req.method ?? 'GET';
    if (body === undefined || method === 'GET' || method === 'HEAD') {
      return new Request(url, { method, headers });
    }

    return new Request(url, { method, headers, body });
  }

  private async readBody(req: http.IncomingMessage): Promise<Buffer | undefined> {
    if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'PATCH') {
      return undefined;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks);
  }

  private async sendResponse(res: http.ServerResponse, response: Response): Promise<void> {
    const headers: http.OutgoingHttpHeaders = {};
    for (const [key, value] of response.headers) {
      headers[key] = value;
    }
    res.writeHead(response.status, headers);
    const body = Buffer.from(await response.arrayBuffer());
    res.end(body);
  }

  private handleRequest(request: Request, clientIp?: string): Response | Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    return this.handleHttpRequest(request, url, clientIp);
  }

  private handleHttpRequest(
    request: Request,
    url: URL,
    clientIp?: string,
  ): Response | Promise<Response> {
    const { pathname } = url;
    if (pathname === '/api/state' && request.method === 'GET') {
      return this.handleState();
    }
    if (pathname === '/api/processes' && request.method === 'GET') {
      return this.handleProcesses();
    }
    if (pathname === '/api/hook' && request.method === 'POST') {
      return this.handleHook(request);
    }
    if (pathname === '/api/reset' && request.method === 'POST' && process.env['E2E_ALLOW_RESET'] === '1') {
      return this.handleReset(request, clientIp);
    }
    if (pathname === '/api/terminals' && request.method === 'POST') {
      return this.handleTerminals(request);
    }
    return new Response('Not found', { status: 404, headers: CORS_HEADERS });
  }

  private handleState(): Response {
    return Response.json(this.buildSnapshot(), { headers: CORS_HEADERS });
  }

  private isLoopbackAddress(clientIp?: string | null): boolean {
    if (clientIp === undefined || clientIp === null) return false;
    const ip = clientIp.toLowerCase();
    return ip === '::1' || ip.startsWith('127.') || ip.startsWith('::ffff:127.');
  }

  private handleReset(request: Request, clientIp?: string): Response {
    void request;
    if (!this.isLoopbackAddress(clientIp)) {
      return new Response('forbidden', { status: 403, headers: CORS_HEADERS });
    }
    this.supervisor.reset();
    this.broadcastSnapshot();
    return new Response(null, { status: 204, headers: CORS_HEADERS });
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

    const identity = await this.supervisor.applyHook(hook);
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

  private async handleTerminals(request: Request): Promise<Response> {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response('invalid JSON', {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    if (body === null || typeof body !== 'object') {
      return new Response('invalid terminals payload', {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    const payload = body as Record<string, unknown>;
    const terminals = payload['terminals'];
    if (!Array.isArray(terminals)) {
      return new Response('terminals must be an array', {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    const parsed: OpenTerminal[] = [];
    for (const entry of terminals) {
      if (entry === null || typeof entry !== 'object') {
        return new Response('terminal entry must be an object', {
          status: 400,
          headers: CORS_HEADERS,
        });
      }

      const terminal = entry as Record<string, unknown>;
      const pid = terminal['pid'];
      const cwd = terminal['cwd'];
      const name = terminal['name'];

      if (typeof pid !== 'number' || typeof cwd !== 'string') {
        return new Response('terminal entry must have numeric pid and string cwd', {
          status: 400,
          headers: CORS_HEADERS,
        });
      }

      parsed.push({
        pid,
        cwd,
        ...(typeof name === 'string' ? { name } : {}),
      });
    }

    this.supervisor.setOpenTerminals(parsed);
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

  private onOpen(ws: WebSocket): void {
    this.clients.add(ws);
    this.sendSnapshot(ws);
  }

  private onClose(ws: WebSocket): void {
    this.clients.delete(ws);
  }

  private sendSnapshot(ws: WebSocket): void {
    const message: WireMessage = {
      type: 'snapshot',
      data: this.buildSnapshot(),
    };
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private broadcastSnapshot(): void {
    const message: WireMessage = {
      type: 'snapshot',
      data: this.buildSnapshot(),
    };
    const payload = JSON.stringify(message);
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  private broadcastEvent(event: HookEvent): void {
    const message: WireMessage = {
      type: 'event',
      data: event,
    };
    const payload = JSON.stringify(message);
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
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
