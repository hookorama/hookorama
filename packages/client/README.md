# `@hookorama/client`

The shared library used by every surface (the CLI, the supervisor,
the VS Code extension) and by external consumers that want to talk
to the supervisor. Owns the wire-protocol types and the socket
client.

This package is a placeholder in PR 1 (the bootstrap). The
supervisor-shape ADR ships the first real public API in PR 2.

## Public API

```ts
import type { /* … */ } from '@hookorama/client';
// import { /* … */ } from '@hookorama/client'; // runtime helpers come later
```

> No runtime exports yet. PR 2 adds them.

## Pinned by

- ADR(s): not yet; this package is a placeholder
- Rules: `.agents/rules/package-readme.md.rule`
- Skills: none