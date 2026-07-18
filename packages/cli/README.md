# `@hookorama/cli` (binary name: `hookorama`)

The user-facing command-line tool. Owns agent install / uninstall
(writing `.claude/settings.json` and `.devin/config.json` in the current
project, etc.) and the `hookorama hook <agent> <status>` dispatch that the
agents call from their native hook configs.

## Public API

```ts
import { main } from '@hookorama/cli';

await main(process.argv.slice(2));
```

## Commands

- `hookorama supervisor start` — start the local supervisor daemon.
- `hookorama supervisor stop` — stop the local supervisor daemon.
- `hookorama status` — show live supervisor state.
- `hookorama hook <agent> <status>` — dispatch a hook event to the supervisor.
- `hookorama setup <agent>` — install the agent hook config.
- `hookorama setup <agent> --update` — refresh the agent hook config.
- `hookorama setup <agent> --remove` — remove the agent hook config.
- `hookorama plugin list` — list built-in agent plugins.

## Pinned by

- ADR(s): `docs/adr/0004-cli-and-plugin-surface.md`
- Rules: `.agents/rules/package-readme.md.rule`
- Skills: none
