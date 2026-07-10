# `@hookorama/supervisor`

The Hookorama daemon: one process per machine, installed as a
user-mode local service. Owns the live in-memory state and the
append-only SQLite history. The only writer in the system.

This package is a placeholder in PR 1 (the bootstrap). The
supervisor-shape ADR ships the first real implementation in PR 2.

## Public API

```ts
import { /* … */ } from '@hookorama/supervisor';
```

> No runtime exports yet. PR 2 adds them.

## Pinned by

- ADR(s): not yet; this package is a placeholder
- Rules: `.agents/rules/package-readme.md.rule`
- Skills: none