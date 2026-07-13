/**
 * Isomorphic supervisor client.
 *
 * Reads the supervisor over HTTP (initial snapshot) and WebSocket (live
 * updates). In Node you can pass a `WebSocketConstructor` from the `ws`
 * package; in the browser it defaults to `globalThis.WebSocket`.
 */

import type { HookEvent, HookRequest, ProcessRow, WireMessage, WireSnapshot } from './types.js';

interface WebSocketLike {
  addEventListener(type: string, listener: (event: Event) => void): void;
  close(): void;
  send(data: string): void;
}

interface WebSocketConstructor {
  new (url: string): WebSocketLike;
}

export interface SupervisorClientOptions {
  /** HTTP base URL for REST endpoints, e.g. `http://127.0.0.1:7354`. */
  readonly httpUrl: string;
  /** WebSocket URL for live updates, e.g. `ws://127.0.0.1:7354/ws`. */
  readonly wsUrl: string;
  /** Override the WebSocket constructor (useful in Node). */
  readonly WebSocketConstructor?: WebSocketConstructor;
}

export class SupervisorClient {
  private readonly httpUrl: string;
  private readonly wsUrl: string;
  private readonly WebSocketConstructor: WebSocketConstructor;
  private ws: WebSocketLike | null = null;

  private onSnapshot?: (snapshot: WireSnapshot) => void;
  private onEvent?: (event: HookEvent) => void;
  private onOpen?: () => void;
  private onClose?: () => void;
  private onError?: (error: unknown) => void;

  constructor(options: SupervisorClientOptions) {
    this.httpUrl = options.httpUrl;
    this.wsUrl = options.wsUrl;
    this.WebSocketConstructor = options.WebSocketConstructor ?? (globalThis.WebSocket as unknown as WebSocketConstructor);
  }

  setOnSnapshot(callback: (snapshot: WireSnapshot) => void): void {
    this.onSnapshot = callback;
  }

  setOnEvent(callback: (event: HookEvent) => void): void {
    this.onEvent = callback;
  }

  setOnOpen(callback: () => void): void {
    this.onOpen = callback;
  }

  setOnClose(callback: () => void): void {
    this.onClose = callback;
  }

  setOnError(callback: (error: unknown) => void): void {
    this.onError = callback;
  }

  /** Fetch the current snapshot and open the WebSocket. */
  async start(): Promise<void> {
    const initial = await this.fetchSnapshot();
    this.onSnapshot?.(initial);
    this.connect();
  }

  /** Close the WebSocket. */
  stop(): void {
    this.ws?.close();
    this.ws = null;
  }

  /** Fetch the OS process table from GET /api/processes. */
  async fetchProcesses(): Promise<ProcessRow[]> {
    const response = await fetch(`${this.httpUrl}/api/processes`);
    if (!response.ok) {
      throw new Error(`processes failed: ${response.status}`);
    }
    return (await response.json()) as ProcessRow[];
  }

  /** Send a hook event via POST /api/hook. */
  async sendHook(request: HookRequest): Promise<void> {
    const response = await fetch(`${this.httpUrl}/api/hook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      throw new Error(`hook failed: ${response.status}`);
    }
  }

  private async fetchSnapshot(): Promise<WireSnapshot> {
    const response = await fetch(`${this.httpUrl}/api/state`);
    if (!response.ok) {
      throw new Error(`snapshot failed: ${response.status}`);
    }
    return (await response.json()) as WireSnapshot;
  }

  private connect(): void {
    const ws = new this.WebSocketConstructor(this.wsUrl);
    this.ws = ws;
    ws.addEventListener('open', () => this.onOpen?.());
    ws.addEventListener('message', (event) => {
      const messageEvent = event as MessageEvent<unknown>;
      const data = messageEvent.data;
      if (typeof data !== 'string') {
        this.onError?.(new TypeError('expected a string message from the WebSocket'));
        return;
      }
      let message: WireMessage;
      try {
        message = JSON.parse(data) as WireMessage;
      } catch (error) {
        this.onError?.(error);
        return;
      }
      if (message.type === 'snapshot') {
        this.onSnapshot?.(message.data);
      } else if (message.type === 'event') {
        this.onEvent?.(message.data);
      }
    });
    ws.addEventListener('close', () => {
      this.ws = null;
      this.onClose?.();
    });
    ws.addEventListener('error', (event) => this.onError?.(event));
  }
}
