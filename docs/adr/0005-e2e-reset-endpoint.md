---
id: 0005
title: E2E reset endpoint and state isolation
type: feature
status: proposed
created: 2026-07-19
supersedes: []
principles: []
jobs: []
---

# ADR 0005 — E2E reset endpoint and state isolation

## Context

The Playwright E2E suite (`e2e/`) runs the supervisor, the web dashboard, and a
mock Ollama agent inside one Docker container. Each spec starts one or more
agent processes through `tmux`, sends lifecycle hooks, and asserts on the UI.

Without a reset mechanism, the supervisor's in-memory state would accumulate
across specs: agents, projects, and process rows from earlier tests would leak
into later assertions. Examples of observed flakiness:

- `04-processes` saw two `bun` agent nodes because a previous agent session was
  still in the state map.
- `02-projects` counted agents from the wrong project after an earlier session
  reused the same `tmux` server.
- `05-events` and `06-analytics` could not predictably count events or task
  totals when stale snapshots were present.

## Decision

Add a gated `POST /api/reset` endpoint to the supervisor that clears the live
state map and the process discovery cache. The endpoint is **only** active when the
environment variable `E2E_ALLOW_RESET=1` is set, so it cannot be enabled by
accident in a real user installation.

### Supervisor changes

- `StateStore.clear()` removes all entries from the live `Map`.
- `Supervisor.reset()` calls `StateStore.clear()` and clears the process
  discovery cache.
- `POST /api/reset` in `packages/supervisor/src/wire/server.ts` calls
  `Supervisor.reset()` and returns `204 No Content`.
- The route is gated per-request on `process.env['E2E_ALLOW_RESET'] === '1'`;
  when unset the `POST` falls through to a `404`.

### E2E harness changes

- `e2e/lib/api.ts` exposes `resetState()` that POSTs to `/api/reset`.
- Every spec's `beforeAll`/`beforeEach` calls `resetState()` before starting a
  new agent session.
- `e2e/docker-entrypoint.sh` and `e2e/playwright.config.ts` both export
  `E2E_ALLOW_RESET=1`.

## Consequences

### Positive

- Specs become order-independent; each test sees a clean supervisor state.
- No need to restart the supervisor between specs, which keeps the Docker image
  fast.
- The gate (`E2E_ALLOW_RESET`) makes it impossible for a production
  installation to expose a destructive reset route.

### Negative

- A test-only route lives in the production supervisor package. It is small and
  guarded, but it is still extra surface area.
- The reset only clears live state; history (once it ships in ADR 0003) must be
  reset independently if tests ever assert on it.

### Reversibility

`medium`. The route, the `StateStore` method, and the `Supervisor` method can be
removed once the E2E harness can instead start a fresh supervisor per spec or
per file. Removing the gate is a one-line change.

## Alternatives considered

1. **Restart the supervisor between specs.** Rejected because it would force
   Playwright to re-establish the WebSocket and HTTP connections for every spec,
   adding seconds of flakiness and startup overhead.
2. **Use unique session/project IDs per spec.** Rejected because it does not
   solve UI-level pollution (e.g. process list showing leftover system
   processes) and makes test assertions harder to read.
3. **Add reset as a CLI subcommand.** Rejected because the E2E container does
   not run the CLI; the web server is the natural surface to hit from the test
   process.

## Open questions

- Should `POST /api/reset` also drop in-memory history/event buffers once those
  layers land? (Likely yes; revisit in ADR 0003.)
- Should the gate be expanded to a runtime `--allow-reset` flag instead of an
  environment variable? The env flag is simpler for Docker; revisit if the CLI
  needs it too.

## Traceability

- Implementation: `packages/supervisor/src/state/store.ts`,
  `packages/supervisor/src/supervisor.ts`,
  `packages/supervisor/src/wire/server.ts`.
- Usage: `e2e/lib/api.ts`, `e2e/docker-entrypoint.sh`,
  `e2e/playwright.config.ts`.
