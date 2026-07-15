import { type Mock, afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { SupervisorClient } from './supervisor-client.js';
import type { HookEvent, HookRequest, WireSnapshot } from './wire.js';

const originalWebSocket = globalThis.WebSocket;
const originalFetch = globalThis.fetch;

function createErrorEvent(error: Error, message = 'mock error'): ErrorEvent {
  return {
    type: 'error',
    message,
    filename: '',
    lineno: 0,
    colno: 0,
    error,
  } as ErrorEvent;
}

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readonly url: string;
  readyState: number;
  binaryType: 'blob' | 'arraybuffer' = 'blob';
  extensions = '';
  protocol = '';
  bufferedAmount = 0;
  readonly CONNECTING = MockWebSocket.CONNECTING;
  readonly OPEN = MockWebSocket.OPEN;
  readonly CLOSING = MockWebSocket.CLOSING;
  readonly CLOSED = MockWebSocket.CLOSED;

  messages: string[] = [];
  private readonly listeners = new Map<string, Set<EventListener>>();

  constructor(url: string | URL, _protocols?: string | string[] | unknown) {
    this.url = url.toString();
    this.readyState = MockWebSocket.CONNECTING;
    MockWebSocket.instances.push(this);
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    this.messages.push(typeof data === 'string' ? data : '[binary]');
  }

  close(_code?: number, _reason?: string): void {
    if (this.readyState === MockWebSocket.CLOSED) return;
    this.readyState = MockWebSocket.CLOSED;
    this.emit('close', new CloseEvent('close', { code: 1000, reason: '', wasClean: true }));
  }

  addEventListener(type: string, listener: EventListener, options?: boolean | AddEventListenerOptions): void {
    const once = options === true || (typeof options === 'object' && options !== null && options.once === true);
    const wrapped: EventListener = once
      ? (event) => {
          this.removeEventListener(type, wrapped);
          listener(event);
        }
      : listener;
    const set = this.listeners.get(type);
    if (set === undefined) {
      this.listeners.set(type, new Set([wrapped]));
    } else {
      set.add(wrapped);
    }
  }

  removeEventListener(type: string, listener: EventListener, _options?: boolean | EventListenerOptions): void {
    this.listeners.get(type)?.delete(listener);
  }

  private emit(type: string, event: Event): void {
    const listeners = this.listeners.get(type);
    if (listeners === undefined) return;
    for (const listener of listeners) {
      listener(event);
    }
  }

  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.emit('open', new Event('open'));
  }

  simulateMessage(data: string): void {
    this.emit('message', new MessageEvent('message', { data }));
  }

  simulateClose(): void {
    this.close();
  }

  simulateError(error?: ErrorEvent): void {
    this.emit('error', error ?? createErrorEvent(new Error('mock error')));
  }
}

const mockFetch = vi.fn() as unknown as Mock<typeof fetch>;

beforeEach(() => {
  MockWebSocket.instances.length = 0;
  globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  globalThis.fetch = mockFetch as unknown as typeof fetch;
  mockFetch.mockClear();
});

afterEach(() => {
  globalThis.WebSocket = originalWebSocket;
  globalThis.fetch = originalFetch;
  MockWebSocket.instances.length = 0;
});

const snapshot: WireSnapshot = {
  kind: 'snapshot',
  at: '2026-07-10T00:00:00.000Z',
  entries: [
    {
      key: 'pid:7',
      status: 'thinking',
      at: '2026-07-10T00:00:00.000Z',
      cwd: '/p',
      agent: 'claude',
    },
  ],
};

const hookEvent: HookEvent = {
  id: 'evt-1',
  at: '2026-07-10T00:00:00.000Z',
  key: 'pid:7',
  status: 'thinking',
  type: 'status.update',
  summary: 'agent is thinking',
  payload: {},
};

describe('SupervisorClient', () => {
  test('connect opens a WebSocket and resolves on open', async () => {
    const client = new SupervisorClient();
    const promise = client.connect('ws://localhost:9332');

    const mockWs = MockWebSocket.instances[0];
    if (mockWs === undefined) throw new Error('MockWebSocket was not created');
    expect(mockWs.url).toBe('ws://localhost:9332/ws');
    expect(mockWs.readyState).toBe(MockWebSocket.CONNECTING);

    mockWs.simulateOpen();
    await promise;

    expect(client.isConnected()).toBe(true);
  });

  test('connect uses http:// base and derives ws:// URL', async () => {
    const client = new SupervisorClient('http://localhost:9332');
    const promise = client.connect();

    const mockWs = MockWebSocket.instances[0];
    if (mockWs === undefined) throw new Error('MockWebSocket was not created');
    expect(mockWs.url).toBe('ws://localhost:9332/ws');

    mockWs.simulateOpen();
    await promise;
    expect(client.isConnected()).toBe(true);
  });

  test('connect rejects on WebSocket error', async () => {
    const client = new SupervisorClient();
    const promise = client.connect();

    const mockWs = MockWebSocket.instances[0];
    if (mockWs === undefined) throw new Error('MockWebSocket was not created');
    mockWs.simulateError();

    await expect(promise).rejects.toThrow('mock error');
  });

  test('connect rejects on WebSocket close before open', async () => {
    const client = new SupervisorClient();
    const promise = client.connect();

    const mockWs = MockWebSocket.instances[0];
    if (mockWs === undefined) throw new Error('MockWebSocket was not created');
    mockWs.simulateClose();

    await expect(promise).rejects.toThrow('WebSocket closed before open');
  });

  test('getSnapshot fetches /snapshot over HTTP', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify(snapshot)));

    const client = new SupervisorClient('http://localhost:9332');
    const result = await client.getSnapshot();

    expect(result.kind).toBe('snapshot');
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.key).toBe('pid:7');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const first = mockFetch.mock.calls[0];
    if (first === undefined) throw new Error('fetch was not called');
    const [url] = first;
    expect(String(url)).toBe('http://localhost:9332/snapshot');
  });

  test('getSnapshot throws on unexpected payload', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ kind: 'not-snapshot' })));

    const client = new SupervisorClient('http://localhost:9332');
    await expect(client.getSnapshot()).rejects.toThrow('Invalid snapshot');
  });

  test('getSnapshot throws on HTTP error', async () => {
    mockFetch.mockResolvedValue(new Response('error', { status: 500 }));

    const client = new SupervisorClient('http://localhost:9332');
    await expect(client.getSnapshot()).rejects.toThrow('HTTP snapshot failed');
  });

  test('onSnapshot receives snapshot broadcasts', async () => {
    const client = new SupervisorClient();
    const connectPromise = client.connect('ws://localhost:9332');
    const mockWs = MockWebSocket.instances[0];
    if (mockWs === undefined) throw new Error('MockWebSocket was not created');
    mockWs.simulateOpen();
    await connectPromise;

    const handler = vi.fn();
    client.onSnapshot(handler);

    mockWs.simulateMessage(JSON.stringify(snapshot));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(snapshot);
  });

  test('onEvent receives event broadcasts', async () => {
    const client = new SupervisorClient();
    const connectPromise = client.connect('ws://localhost:9332');
    const mockWs = MockWebSocket.instances[0];
    if (mockWs === undefined) throw new Error('MockWebSocket was not created');
    mockWs.simulateOpen();
    await connectPromise;

    const handler = vi.fn();
    client.onEvent(handler);

    mockWs.simulateMessage(JSON.stringify({ kind: 'event', event: hookEvent }));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(hookEvent);
  });

  test('onError receives WebSocket errors', async () => {
    const client = new SupervisorClient();
    const connectPromise = client.connect('ws://localhost:9332');
    const mockWs = MockWebSocket.instances[0];
    if (mockWs === undefined) throw new Error('MockWebSocket was not created');
    mockWs.simulateOpen();
    await connectPromise;

    const handler = vi.fn();
    client.onError(handler);

    mockWs.simulateError();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('sendHook sends a WireHook and resolves on ack', async () => {
    const client = new SupervisorClient();
    const connectPromise = client.connect('ws://localhost:9332');
    const mockWs = MockWebSocket.instances[0];
    if (mockWs === undefined) throw new Error('MockWebSocket was not created');
    mockWs.simulateOpen();
    await connectPromise;

    const request: HookRequest = { status: 'thinking', agent: 'claude' };
    const sendPromise = client.sendHook(request);

    const raw = mockWs.messages[0];
    if (raw === undefined) throw new Error('No hook was sent');
    const sent = JSON.parse(raw) as unknown;
    if (typeof sent !== 'object' || sent === null || !('id' in sent)) {
      throw new Error('Sent hook is not an object with id');
    }
    const id = (sent as { id: string }).id;
    expect((sent as unknown as { kind: string }).kind).toBe('hook');
    expect((sent as unknown as { status: string }).status).toBe('thinking');
    expect((sent as unknown as { agent: string }).agent).toBe('claude');

    mockWs.simulateMessage(JSON.stringify({ kind: 'ack', id }));

    const ack = await sendPromise;
    expect(ack.kind).toBe('ack');
    expect(ack.id).toBe(id);
  });

  test('sendHook rejects on WireError', async () => {
    const client = new SupervisorClient();
    const connectPromise = client.connect('ws://localhost:9332');
    const mockWs = MockWebSocket.instances[0];
    if (mockWs === undefined) throw new Error('MockWebSocket was not created');
    mockWs.simulateOpen();
    await connectPromise;

    const sendPromise = client.sendHook({ status: 'thinking' });

    const raw = mockWs.messages[0];
    if (raw === undefined) throw new Error('No hook was sent');
    const sent = JSON.parse(raw) as unknown;
    if (typeof sent !== 'object' || sent === null || !('id' in sent)) {
      throw new Error('Sent hook is not an object with id');
    }
    const id = (sent as { id: string }).id;

    mockWs.simulateMessage(JSON.stringify({ kind: 'error', id, message: 'bad status' }));

    await expect(sendPromise).rejects.toThrow('bad status');
  });

  test('sendHook rejects when not connected', async () => {
    const client = new SupervisorClient();
    await expect(client.sendHook({ status: 'thinking' })).rejects.toThrow(
      'SupervisorClient not connected',
    );
  });
});
