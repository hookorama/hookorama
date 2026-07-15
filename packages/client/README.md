# `@hookorama/client`

The shared, isomorphic library used by every surface (CLI, web dashboard,
VS Code extension) and by external consumers that want to talk to the
supervisor. Owns the wire-protocol types and the WebSocket/HTTP client.

## Public API

```ts
import {
  SupervisorClient,
  type Status,
  type ProcessEntry,
  type AgentMetadata,
  type HookRequest,
  type HookEvent,
  type WireSnapshot,
  type WireMessage,
} from '@hookorama/client';
```

## Pinned by

- ADR(s): ADR 0001 (supervisor shape); wire-protocol ADR pending
- Rules: `.agents/rules/package-readme.md.rule`
- Skills: none
