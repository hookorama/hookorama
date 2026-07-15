import type {
  HookEvent,
  HookRequest,
  WireAck,
  WireError,
  WireEvent,
  WireSnapshot,
  WireHook,
} from './wire.js';

const DEFAULT_BASE_URL = 'http://localhost:9332';

function resolveWsUrl(base: URL): URL {
  const url = new URL('/ws', base);
  if (url.protocol === 'http:') url.protocol = 'ws:';
  else if (url.protocol === 'https:') url.protocol = 'wss:';
  return url;
}

function resolveHttpUrl(base: URL): URL {
  const url = new URL('/snapshot', base);
  if (url.protocol === 'ws:') url.protocol = 'http:';
  else if (url.protocol === 'wss:') url.protocol = 'https:';
  return url;
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;
}

export interface SupervisorClientOptions {
  readonly baseUrl?: string | URL;
}

interface PendingHandler {
  resolve: (ack: WireAck) => void;
  reject: (error: Error) => void;
}

/**
 * Isomorphic WebSocket + HTTP client for the supervisor.
 *
 * Connects to the supervisor's `/ws` endpoint for live events and uses
 * HTTP `GET /snapshot` for on-demand reads. Hook writes are sent over
 * the WebSocket and acknowledged with a `WireAck`.
 */
export class SupervisorClient {
  private baseUrl: URL = new URL(DEFAULT_BASE_URL);
  private ws: WebSocket | null = null;
  private connectPromise: Promise<void> | null = null;
  private connected = false;
  private readonly pending = new Map<string, PendingHandler>();
  private readonly snapshotHandlers = new Set<(snapshot: WireSnapshot) => void>();
  private readonly eventHandlers = new Set<(event: HookEvent) => void>();
  private readonly errorHandlers = new Set<(error: Error) => void>();

  constructor(options?: SupervisorClientOptions | string | URL) {
    if (options === undefined) return;
    if (typeof options === 'string' || options instanceof URL) {
      this.baseUrl = options instanceof URL ? options : new URL(options);
      return;
    }
    if (options.baseUrl !== undefined) {
      this.baseUrl =
        options.baseUrl instanceof URL ? options.baseUrl : new URL(options.baseUrl);
    }
  }

  /** Open the WebSocket to the supervisor. */
  connect(baseUrl: string | URL = this.baseUrl): Promise<void> {
    const nextUrl = baseUrl instanceof URL ? baseUrl : new URL(baseUrl);
    if (this.isConnected() && this.baseUrl.toString() === nextUrl.toString()) {
      return Promise.resolve();
    }
    if (this.ws !== null) {
      this.disconnect();
    }

    this.baseUrl = nextUrl;
    const ws = new WebSocket(resolveWsUrl(this.baseUrl));
    this.ws = ws;

    let settled = false;
    let resolveConnect: () => void;
    let rejectConnect: (reason: Error) => void;
    this.connectPromise = new Promise<void>((resolve, reject) => {
      resolveConnect = resolve;
      rejectConnect = reject;
    });

    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      fn();
    };

    ws.addEventListener(
      'open',
      () => {
        finish(() => {
          this.connected = true;
          this.connectPromise = null;
          resolveConnect();
        });
      },
      { once: true },
    );

    ws.addEventListener(
      'error',
      (event) => {
        const error = this.toError(event);
        finish(() => {
          this.connectPromise = null;
          rejectConnect(error);
        });
        this.handleError(error);
        this.disconnect();
      },
      { once: true },
    );

    ws.addEventListener(
      'close',
      () => {
        finish(() => {
          this.connectPromise = null;
          rejectConnect(new Error('WebSocket closed before open'));
        });
        this.connected = false;
        if (this.ws === ws) {
          this.ws = null;
          this.connectPromise = null;
          this.rejectPending(new Error('WebSocket closed'));
        }
      },
      { once: true },
    );

    ws.addEventListener('message', (event) => {
      this.handleMessage(event);
    });

    return this.connectPromise;
  }

  /** Close the WebSocket and reject any in-flight hooks. */
  disconnect(): void {
    if (this.ws === null) return;
    const ws = this.ws;
    this.ws = null;
    this.connected = false;
    this.connectPromise = null;
    this.rejectPending(new Error('SupervisorClient disconnected'));
    try {
      ws.close();
    } catch {
      void 0;
    }
  }

  /** True when the WebSocket is open and ready. */
  isConnected(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }

  /** Fetch a full snapshot over HTTP. */
  async getSnapshot(): Promise<WireSnapshot> {
    const response = await fetch(resolveHttpUrl(this.baseUrl));
    if (!response.ok) {
      throw new Error(`HTTP snapshot failed: ${response.status}`);
    }
    const raw = await response.json();
    const record = toRecord(raw);
    if (record === undefined) {
      throw new Error('Invalid snapshot: not an object');
    }
    const kind = typeof record['kind'] === 'string' ? record['kind'] : undefined;
    if (kind !== 'snapshot' || !Array.isArray(record['entries']) || typeof record['at'] !== 'string') {
      throw new Error('Invalid snapshot: missing kind, entries, or at');
    }
    return record as unknown as WireSnapshot;
  }

  /** Send a hook to the supervisor and wait for its ack. */
  sendHook(request: HookRequest, timeoutMs = 5000): Promise<WireAck> {
    if (!this.isConnected()) {
      return Promise.reject(new Error('SupervisorClient not connected'));
    }
    const ws = this.ws;
    if (ws === null || ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('SupervisorClient not connected'));
    }

    const id = generateId();
    const message: WireHook = { kind: 'hook', id, ...request };

    return new Promise<WireAck>((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const cleanup = (): void => {
        if (timeoutId !== undefined) {
          clearTimeout(timeoutId);
          timeoutId = undefined;
        }
        this.pending.delete(id);
      };

      this.pending.set(id, {
        resolve: (ack) => {
          cleanup();
          resolve(ack);
        },
        reject: (error) => {
          cleanup();
          reject(error);
        },
      });

      if (timeoutMs > 0) {
        timeoutId = setTimeout(() => {
          cleanup();
          reject(new Error(`Hook request ${id} timed out`));
        }, timeoutMs);
      }

      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        cleanup();
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /** Subscribe to full snapshot broadcasts. Returns an unsubscribe function. */
  onSnapshot(handler: (snapshot: WireSnapshot) => void): () => void {
    this.snapshotHandlers.add(handler);
    return () => {
      this.snapshotHandlers.delete(handler);
    };
  }

  /** Subscribe to hook events. Returns an unsubscribe function. */
  onEvent(handler: (event: HookEvent) => void): () => void {
    this.eventHandlers.add(handler);
    return () => {
      this.eventHandlers.delete(handler);
    };
  }

  /** Subscribe to connection errors. Returns an unsubscribe function. */
  onError(handler: (error: Error) => void): () => void {
    this.errorHandlers.add(handler);
    return () => {
      this.errorHandlers.delete(handler);
    };
  }

  private handleMessage(event: MessageEvent): void {
    const data = event.data as unknown;
    if (typeof data !== 'string') {
      this.emitError(new Error('Unexpected WebSocket binary message'));
      return;
    }
    const raw = JSON.parse(data) as unknown;
    this.dispatch(raw);
  }

  private dispatch(raw: unknown): void {
    const record = toRecord(raw);
    if (record === undefined) return;

    const kind = typeof record['kind'] === 'string' ? record['kind'] : undefined;
    if (kind === undefined) return;

    switch (kind) {
      case 'snapshot': {
        const snapshot = record as unknown as WireSnapshot;
        for (const handler of this.snapshotHandlers) {
          handler(snapshot);
        }
        break;
      }
      case 'event': {
        const wireEvent = record as unknown as WireEvent;
        for (const handler of this.eventHandlers) {
          handler(wireEvent.event);
        }
        break;
      }
      case 'ack': {
        const ack = record as unknown as WireAck;
        const handler = this.pending.get(ack.id);
        if (handler !== undefined) {
          handler.resolve(ack);
          this.pending.delete(ack.id);
        }
        break;
      }
      case 'error': {
        const error = record as unknown as WireError;
        if (error.id !== undefined) {
          const handler = this.pending.get(error.id);
          if (handler !== undefined) {
            handler.reject(new Error(error.message));
            this.pending.delete(error.id);
          }
        } else {
          this.emitError(new Error(error.message));
        }
        break;
      }
      case 'hook': {
        // Clients send hooks; they are not consumed here.
        break;
      }
      default:
        return;
    }
  }

  private toError(event: ErrorEvent): Error {
    return event.error instanceof Error
      ? event.error
      : new Error(event.message || 'WebSocket error');
  }

  private handleError(error: Error): void {
    this.emitError(error);
  }

  private emitError(error: Error): void {
    for (const handler of this.errorHandlers) {
      handler(error);
    }
  }

  private rejectPending(error: Error): void {
    const handlers = Array.from(this.pending.values());
    this.pending.clear();
    for (const handler of handlers) {
      handler.reject(error);
    }
  }
}
