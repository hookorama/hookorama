# `@hookorama/supervisor`

The Hookorama daemon: one process per machine, installed as a user-mode
local service. Owns the live in-memory state and is the only writer in the
system. Exposes an HTTP/JSON and WebSocket surface on `127.0.0.1:7354`.

## Public API

```ts
import { Supervisor } from '@hookorama/supervisor';

const supervisor = new Supervisor({
  lifecycle: { customPidPath: '/tmp/hookorama.pid' },
});

await supervisor.start(); // returns false if another supervisor is running
supervisor.setOpenTerminals([{ pid: 1234, cwd: '/home/user' }]);
await supervisor.applyHook({ status: 'thinking', pidChain: [1234], cwd: '/home/user' });
console.warn(supervisor.snapshot());
await supervisor.stop();
```

The wire protocol server is implemented in `src/main.ts`:

```bash
bun packages/supervisor/src/main.ts
```

## Pinned by

- ADR(s): [`0001`](../../docs/adr/0001-supervisor-shape.md), [`0003`](../../docs/adr/0003-wire-protocol-and-web-dashboard.md)
- Rules: `.agents/rules/package-readme.md.rule`
- Skills: none
- Memory: `.agents/memory/facts/pid-chain-beats-session-id.md`
