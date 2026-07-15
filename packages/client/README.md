# `@hookorama/client`

The shared library used by every surface (the CLI, the supervisor,
the VS Code extension, and the web dashboard) and by any external
consumer that wants to talk to the supervisor. Owns the wire-protocol
types and the socket client.

## Public API

```ts
import { SupervisorClient } from '@hookorama/client';
import type { Status, WireSnapshot, HookRequest, AgentMetadata } from '@hookorama/client';

const client = new SupervisorClient({
  httpUrl: 'http://127.0.0.1:7354',
  wsUrl: 'ws://127.0.0.1:7354/ws',
});

client.setOnSnapshot((snapshot: WireSnapshot) => console.log(snapshot.entries));
client.setOnEvent((event) => console.log(event.type, event.summary));
client.setOnOpen(() => console.log('connected'));
client.setOnClose(() => console.log('disconnected'));
client.setOnError((error) => console.warn(error));

await client.start();

await client.sendHook({
  status: 'thinking',
  cwd: process.cwd(),
  agent: 'my-agent',
  metadata: {
    currentTask: 'planning',
    projectId: 'proj_my',
    origin: 'terminal',
  } as AgentMetadata,
});
```

> The client is isomorphic: it defaults to `globalThis.WebSocket` in the
> browser and accepts a `WebSocketConstructor` override for Node.

## Pinned by

- ADR(s): `0003`
- Rules: `.agents/rules/package-readme.md.rule`
- Skills: none
