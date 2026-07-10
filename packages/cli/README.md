# `@hookorama/cli` (binary name: `hookorama`)

The user-facing command-line tool. Owns agent install / uninstall
(writing `~/.claude/settings.json`, `~/.devin/hooks.v1.json`,
etc.) and the `hookorama hook <event>` dispatch that the agents
call from their native hook configs.

This package is a placeholder in PR 1 (the bootstrap). The
CLI-surface ADR ships the first real implementation in PR 4.

## Public API

```ts
import { main } from '@hookorama/cli';

await main(process.argv.slice(2));
```

> No runtime exports yet. PR 4 adds them.

## Pinned by

- ADR(s): not yet; this package is a placeholder
- Rules: `.agents/rules/package-readme.md.rule`
- Skills: none