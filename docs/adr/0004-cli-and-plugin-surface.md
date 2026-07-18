---
id: 0004
title: Universal CLI and plugin surface
type: feature
status: proposed
created: 2026-07-14
supersedes: []
principles: []
jobs: []
---

# ADR 0004 — Universal CLI and plugin surface

## Context

Hookorama already has a live supervisor (ADR 0001) and a wire protocol (ADR 0003),
but there is no easy way for an agent to report its status or for a user to
manage the supervisor. Today `packages/cli` is a skeleton that only re-exports a
`main` placeholder. PR 4 will turn `packages/cli` into a global `hookorama`
command that agent authors and end users can install once and use everywhere.

Agent-specific hooks (Claude, Devin, and others) differ in how they are
installed: each agent has its own settings file, its own shell environment, and
its own placeholder grammar. A universal CLI must therefore be paired with a
plugin model: a common `AgentPlugin` interface that every agent implements, and
agent-specific plugins that know how to install the hook into the agent's
configuration.

## Decision

`packages/cli` becomes a `hookorama` binary. It exposes:

- `hookorama supervisor start` — start the supervisor daemon; idempotent.
- `hookorama supervisor stop` — stop the daemon via the PID file.
- `hookorama status` — show the live snapshot and OS process tree.
- `hookorama hook <agent> <status>` — dispatch a `HookRequest` to the supervisor.
- `hookorama setup <agent>` — install the agent's hook config.
- `hookorama setup <agent> --update` — refresh the agent's hook config.
- `hookorama setup <agent> --remove` — remove the agent's hook config.
- `hookorama plugin list` — list built-in plugins.
- `hookorama dashboard` — start the web dashboard (runs the Vite dev server from `packages/web-app`).

Key contracts:

- `packages/cli/src/plugin.ts` defines the `AgentPlugin` interface:
  - `buildHookRequest(args: string[]): HookRequest` parses the raw CLI tokens
    after `hook <agent>` and returns a valid `HookRequest`.
  - `install(opts)`, `update(opts)`, `remove(opts)` manage the agent's
    project-scoped hook configuration (e.g. `.claude/settings.json`,
    `.devin/config.json`).
  - Optional `status()` returns whether the plugin is installed and where.
- Built-in plugins live in `packages/cli/src/plugins/` and are registered by
  `packages/cli/src/plugin-registry.ts`. PR 4 ships `claude` and `devin`.
- The plugin registry is intentionally open-ended: later PRs can load external
  plugins from `node_modules/hookorama-plugin-*` or `~/.hookorama/plugins`.
- The `hook` command is supervisor-aware: it calls `ensureSupervisor()` and
  auto-starts the daemon if it is not already running.
- The supervisor daemon is started in-process by `hookorama supervisor start`
  using `Supervisor` and `WireServer` from `@hookorama/supervisor`.
- `packages/cli/src/main.ts` is the `bin` entry. `packages/cli/src/index.ts`
  exports `main` and `AgentPlugin` for programmatic use.
- `packages/cli/package.json` becomes `private: false` with `version: 0.1.0` and
  `bin: "./dist/main.mjs"`. Its workspace dependencies (`@hookorama/client`,
  `@hookorama/supervisor`) also become `private: false` so the CLI can be linked
  and eventually published.

## Acceptance criteria

- [ ] `hookorama supervisor start` starts the daemon and exits 0 if it is already running.
- [ ] `hookorama supervisor stop` stops the daemon and cleans up the PID file.
- [ ] `hookorama status` prints a summary of live agents and processes.
- [ ] `hookorama hook <agent> <status>` dispatches a valid `HookRequest`.
- [ ] `hookorama setup <agent>` installs the agent hook config without overwriting unrelated settings.
- [ ] `hookorama plugin list` shows the built-in plugins.
- [ ] `hookorama dashboard` starts the Vite dev server for `packages/web-app` and inherits stdio.
- [ ] `bun run ci` passes before the PR is merged.

## Consequences

### Positive

- One global command for every agent, instead of per-agent shell scripts.
- Agent-specific complexity is isolated in plugins.
- The same `SupervisorClient` and wire protocol are reused by the CLI.
- `bun link` in `packages/cli` makes the CLI usable during development.

### Negative

- The CLI becomes a public surface; its command schema is a contract.
- Plugins must be installed, updated, and tested per agent.
- `Bun.serve` is a Bun-only runtime dependency, so the CLI requires Bun.
- Publishing `hookorama` requires making `@hookorama/client` and
  `@hookorama/supervisor` public and versioned.

### Reversibility

`medium`. The `AgentPlugin` interface and the `hookorama` command tree can be
deprecated, but once users install agent configs that call `hookorama hook <agent>`,
removing the command would break those agents.

## Alternatives considered

- **Separate per-agent CLIs** (`claude-hk`, `devin-hk`) — simpler to build, but
  fragments the experience and duplicates supervisor lifecycle code.
- **Agent config writes to `package.json` scripts** — avoids touching user dotfiles,
  but cannot intercept the agent's own lifecycle events.
- **Use `npm`/`yarn` global install** — requires Node-compatible `Bun.serve`
  or a separate server implementation; defer until there is demand outside Bun.

## Open questions

- What is the exact schema for `.claude/settings.json` and
  `.devin/config.json`? The plugins will start with the most common
  conventions and adjust once the first real agent environments are tested.
- Should `hookorama dev` be a future command? Implemented as `hookorama dashboard`, which runs `bun run dev` in `packages/web-app` from the CLI package directory.
- Should external plugins be loaded via `bun install -g` or discovered by name?
  Defer until the first third-party plugin appears.

## Traceability

- **SPEC.md rows:** CLI, Agent plugins.
- **ROADMAP.md phase:** Phase 3 — Universal CLI + plugin surface.
- **Files this decision creates / owns:**
  - `docs/adr/0004-cli-and-plugin-surface.md` (this file)
  - `packages/cli/src/main.ts`, `packages/cli/src/index.ts`
  - `packages/cli/src/plugin.ts`, `packages/cli/src/plugin-registry.ts`
  - `packages/cli/src/commands/{supervisor,hook,setup,status,dashboard}.ts`
  - `packages/cli/src/plugins/{claude,devin}.ts`
  - `packages/cli/src/util/supervisor.ts`
  - `packages/cli/package.json`, `packages/cli/tsdown.config.ts`
  - `packages/supervisor/src/index.ts` (exports `WireServer` for CLI reuse)
