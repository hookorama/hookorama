# `@hookorama/supervisor`

The Hookorama daemon: one process per machine, installed as a user-mode
local service. Owns the live in-memory state and is the only writer in the
system. Exposes an HTTP/JSON and WebSocket surface on `127.0.0.1:7354`.

## Public API

```ts
import { Supervisor } from '@hookorama/supervisor';
import type { ProcessDiscovery, ProcessRow } from '@hookorama/supervisor';

const supervisor = new Supervisor({
  lifecycle: { customPidPath: '/tmp/hookorama.pid' },
});

await supervisor.start(); // returns false if another supervisor is running
supervisor.setOpenTerminals([{ pid: 1234, name: '/bin/bash', cwd: '/home/user' }]);
supervisor.applyHook({ status: 'thinking', pidChain: [1234], cwd: '/home/user' });
console.warn(supervisor.snapshot());
await supervisor.stop();
```

The wire protocol is implemented in `src/main.ts`:

```bash
bun packages/supervisor/src/main.ts
```

## Pinned by

- ADR(s): `0001`, `0003`
- Rules: `.agents/rules/package-readme.md.rule`
- Skills: none
