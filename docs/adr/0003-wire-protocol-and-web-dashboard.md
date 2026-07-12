---
id: 0003
title: Wire protocol and web dashboard MVP
type: contract
status: proposed
created: 2026-07-12
supersedes: []
principles: []
jobs: []
---

# ADR 0003 — Wire protocol and web dashboard MVP

## Context

Hookorama ships a single supervisor per machine (ADR 0001). Until now
that supervisor has no public surface: the only consumer is the
extension's local status-bar, and the `lovable-prototype` dashboard ran
on a mock ticker. PR 2 must expose the live state so that surfaces can
read it without becoming second writers.

The `lovable-prototype` already proved the dashboard UX: terminal-brutalist
overview, project/agent/process navigation, and an event stream. The task
is to move that design into the monorepo and power it from the real
supervisor.

## Decision

The supervisor exposes a read-only HTTP/JSON and WebSocket protocol on
`127.0.0.1:7354`. `packages/client` owns the wire types and the
`SupervisorClient`. `packages/supervisor` implements the server and
broadcasts snapshots. `packages/web-app` is a Vite + React + TanStack
Router SPA that connects to the supervisor and renders the overview from
the `lovable-prototype` design.

Key contracts:

- `GET /api/state` returns the current `WireSnapshot` (`entries: ProcessEntry[]`).
- `POST /api/hook` accepts `HookRequest` and updates live state.
- `WebSocket /ws` pushes `snapshot` and `event` messages to all clients.
- `ProcessEntry` carries an optional `metadata` block (metrics, model, skill,
  current task, waiting reason) so agents can publish dashboard numbers.
- Surfaces are read-only consumers; the supervisor is the only writer.
- `packages/web-app` is built with `vite` and not with `tsdown`; the root
  build pipeline will run `tsdown` for the library packages and then build
  the web app.

## Acceptance criteria

- [ ] `GET /api/state` returns the current `WireSnapshot` (`entries: ProcessEntry[]`).
- [ ] `POST /api/hook` accepts `HookRequest` and updates live state.
- [ ] `WebSocket /ws` pushes `snapshot` and `event` messages to all clients.
- [ ] `packages/client` exports the wire types and `SupervisorClient`.
- [ ] `packages/web-app` is a Vite + React + TanStack Router SPA that reads the live state.
- [ ] `bun run ci` passes before the PR is merged.

## Consequences

### Positive

- One source of truth for the live state and the dashboard.
- The dashboard works with real data from the first PR.
- The same `SupervisorClient` can be reused by the CLI and the extension.
- Loopback-only binding gives a simple local security model.

### Negative

- The wire protocol is a public contract; frame changes require client updates.
- The dashboard is currently local-only; remote access needs future design.
- Serving the `web-app` build from the supervisor is left to the CLI (PR 3).

### Reversibility

`medium`. The wire frames can be versioned, but changing `ProcessEntry` shape
forces updates to `packages/client`, `packages/supervisor`, and `packages/web-app`.

## Alternatives considered

- **Unix socket** — avoids network but is harder to consume from a browser
  and from Windows.
- **TanStack Start SSR** — `lovable-prototype` used it, but it adds Nitro,
  server-side rendering, and a deployment model we do not need for a local
  dashboard.
- **Polling** — simpler but creates visible latency; WebSocket gives live
  updates for the same implementation cost.
- **gRPC** — stronger schema but requires a code-generation step and extra
  dependencies for a local, single-consumer protocol.

## Open questions

- Do we need a token or auth model for the local endpoint? Defer until
  remote access is requested.
- Should the supervisor serve the built `web-app` assets directly, or should
  the CLI own static file serving? Decide in PR 3.
- How does `metadata` interact with a future persistence layer (SQLite)?
  Keep the field as an opaque, serializable object for now.

## Traceability

- **SPEC.md rows:** `Wire protocol`, `Web dashboard`.
- **ROADMAP.md phase:** Phase 2 — Wire protocol + web dashboard MVP.
- **Files this decision creates / owns:**
  - `docs/adr/0003-wire-protocol-and-web-dashboard.md` (this file)
  - `packages/client/src/types.ts`, `packages/client/src/client.ts`, `packages/client/src/index.ts`
  - `packages/supervisor/src/wire/server.ts`, `packages/supervisor/src/main.ts`
  - `packages/web-app/src/*` (SPA entry, routes, design system, store, source)
