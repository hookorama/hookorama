# `@hookorama/web-app`

The local web dashboard. Reads from the supervisor's HTTP/WS
interface on `127.0.0.1:7354` (the only network surface in the
system) and renders the panorama: agents, processes, history,
analytics, web terminal.

This package is a placeholder in PR 1 (the bootstrap). The
framework choice (TanStack Start vs another) lands in Phase 5
when the supervisor and the wire protocol exist. The placeholder
keeps the workspace build green and reserves the package slot.

## Public API

```ts
import { /* … */ } from '@hookorama/web-app';
```

> No runtime exports yet. Phase 5 adds them.

## Pinned by

- ADR(s): not yet; this package is a placeholder
- Rules: `.agents/rules/package-readme.md.rule`
- Skills: none