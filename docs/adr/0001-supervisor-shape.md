---
id: 0001
title: Supervisor shape — identity, lifecycle, single writer
type: component
status: accepted
created: 2026-07-10
supersedes: []
principles: [P-2, P-5]
jobs: [H-1, H-2, H-4]
---

# ADR 0001 — Supervisor shape

## Context

Hookorama is a local supervisor for LLM and CLI agents. The
supervisor is the only stateful component of the system: it
accepts hook events from agents, keeps a live picture of what is
running right now, and persists an append‑only history of every
event it has ever seen (per `docs/NORTH-STAR.md`). Every other
surface (the VS Code extension, the CLI, the web dashboard, the
MCP server) is a peer consumer of that state.

This ADR pins the supervisor's shape: its identity model, its
in‑memory state schema, its lifecycle, and the single‑writer
contract that the rest of the system depends on. v1's predecessor
shipped a two‑tier design (per‑window + global supervisors) that
failed in five concrete ways (documented in `docs/adr/0002-v1-postmortem.md`).

## Decision

### Identity model (P‑2: process > session > cwd)

A process is identified, in order of preference:

1. **OS PID** — the supervisor receives a `pidChain` (own pid
   first, ancestors after, FR‑D.6 of the predecessor) and walks
   the open terminal table (`vscode.Terminal.processId` shipped
   by the extension over the wire) for an exact match.
2. **`cwd`** — only when no pid in `pidChain` resolves to a
   known open terminal. Multiple terminals sharing a `cwd` are
   collapsed into one row, marked with a visible "ambiguous" badge
   in the UI.
3. **`session_id`** — never used as a key. Always carried as
   enrichment only. A session id changes across `/clear` and
   `/new` even within the same terminal (v1 FR‑D.6 documented
   this as a learned lesson), and two agents sharing a session id
   is rare but possible.

Rationale: see `.agents/memory/facts/pid-chain-beats-session-id.md`.

### State schema

The supervisor holds two kinds of state:

- **Live state** (in memory) — a `Map<ProcessKey, ProcessEntry>`
  where `ProcessKey` is `pid:<number>` when resolved, else
  `cwd:<normalized-path>`. `ProcessEntry` carries
  `{ status, at, cwd, sessionId?, agent?, pid?, pidChain?, parentKey? }`.
  `parentKey` is set only for virtual subagent nodes (see below).
  The map is rebuilt from `/proc` (Linux), `ps` (macOS), or
  `wmic`/`tasklist` (Windows) on every supervisor startup, then
  mutated by incoming hook events.
- **History** (SQLite, append‑only) — opened in‑process by the
  supervisor. Schema, retention policy, and migrations land in
  ADR `0003-history-schema` (Phase 2). PR 2 ships the supervisor
  shape; PR 3 ships the history layer.

### Lifecycle (P‑5: long‑running local service)

- **One supervisor per machine.** Installed as a user‑mode local
  service via `hookorama install-service`:
  - macOS: `~/Library/LaunchAgents/dev.hookorama.supervisor.plist`
    via `launchctl bootstrap gui/$UID`.
  - Linux: `~/.config/systemd/user/hookorama-supervisor.service`
    via `systemctl --user enable --now hookorama-supervisor`.
  - Windows: per‑user scheduled task via `schtasks /create` with
    trigger "at logon".
- **Idempotent auto‑start.** On every client connection attempt,
  the surface checks `$XDG_RUNTIME_DIR/hookorama/supervisor.pid`.
  If the pid file exists, it dials the socket. If not, it
  spawns the supervisor and waits up to 5 seconds for the socket
  to appear.
- **Signals.** `SIGTERM` → graceful shutdown (close socket,
  flush history, write pid file removal) → `SIGKILL` after 10
  seconds. `SIGHUP` reloads the config without a restart.
- **PID file.** `$XDG_RUNTIME_DIR/hookorama/supervisor.pid`
  (Linux/macOS); `%LOCALAPPDATA%\hookorama\supervisor.pid`
  (Windows). A second supervisor noticing this file at startup
  exits cleanly and lets the first one keep serving.

### Single‑writer contract

- The supervisor is the **only writer of both live state and
  history**. Surfaces read by querying (live state via
  NDJSON socket; history via the supervisor's read‑only HTTP
  endpoint that fronts SQLite).
- Every hook event is **written to history before it is
  acknowledged** to the client. The wire frame is
  `{ kind: 'ack', id: <client-request-id> }` and is only sent
  after the SQLite write commits.
- Surfaces never write to live state directly. A surface that
  needs a write calls into the supervisor over the wire; the
  supervisor mutates its own state and broadcasts the diff.

### Subagent handling (virtual parent key)

When a `start_subagent` hook arrives, the supervisor creates a
virtual child entry on top of the parent's `Map<ProcessKey,
ProcessEntry>` with `parentKey = <parent-key>`. The child shares
the parent's pid (subagents run in the parent's own process);
`parentKey` is the only thing that distinguishes them in the
tree. `end_subagent` closes the child without touching the
parent's own status.

## Consequences

### Positive

- One machine → one picture. Surfaces never see conflicting
  states from competing supervisors (F1 of the v1 postmortem is
  solved by construction).
- Identity by `pidChain` removes the "two terminals in the same
  directory merge into one row" bug (v1 FR‑D.6 / FR‑U.11).
- Append‑only history is durable across supervisor restarts.
  "Yesterday at 3pm" is answerable the moment the history layer
  ships in PR 3.
- Service install gives the supervisor a stable lifecycle that
  does not depend on any IDE window being open.

### Negative

- Service installation is a real maintenance burden across three
  platforms; CI must lint the install artifacts in addition to
  building them. Mitigated by `packages/supervisor/src/service-install/`
  being a single directory with three platform‑specific files
  (`darwin.ts`, `linux.ts`, `windows.ts`) and one shared schema.
- The 5‑second auto‑start budget means the first hook of a fresh
  login takes ~5s longer than v1. Acceptable: this happens once
  per login.
- We commit to a pid‑first model that is harder to debug than
  cwd‑only. The "ambiguous" badge in the UI is the only user
  visible mitigation.

### Reversibility

`hard`. Switching to a different identity model would invalidate
every surface that matches `pid:<n>`. The supervisor's other
aspects (lifecycle, single‑writer) are individually easy to
change.

## Alternatives considered

- **Two‑tier (per‑window + global) supervisor.** This is v1's
  design. Rejected: see `docs/adr/0002-v1-postmortem.md` for
  the five failures. Specifically, F1 ("window A's status bar
  cannot see window B's agents") is fatal.
- **`cwd`‑only identity.** Simpler; matches v1's first
  implementation. Rejected by P‑2 — two terminals in the same
  directory would be collapsed into one row (the actual bug v1
  FR‑D.6 documented).
- **In‑memory only, no history.** Rejected by P‑8 ("the history
  is the product, not a cache"). History ships in PR 3; this PR
  pins the contract, not the implementation.
- **Tied to the VS Code extension's lifecycle.** Rejected by
  P‑5 — the supervisor must outlive any single IDE window.

## Open questions

- Whether `session_id` is ever surfaced in the UI at all (vs.
  dropped at ingest). Tracked for the Analytics ADR.
- Whether `pidChain[0]` (the agent's own pid) is enough to
  identify subagents, or whether the supervisor must learn
  Claude/Devin's `agent_id` enrichment field. Tracked for the
  wire‑protocol ADR.

## Traceability

- **Mission:** `docs/NORTH-STAR.md` §"What 'service' means here";
  §"Vocabulary" (`Supervisor`).
- **Principles:** `P-2` (process identity beats session identity
  beats cwd identity); `P-5` (one supervisor, many surfaces).
- **Jobs:** `H-1` (panorama), `H-2` (map), `H-4` (replay — gated
  on the history ADR that follows this one).
- **SPEC.md row:** `Supervisor`.
- **ROADMAP.md phase:** Phase 1 — Supervisor.
- **Files this decision creates / owns:**
  `packages/supervisor/src/main.ts` (the daemon entry),
  `packages/supervisor/src/process-discovery/` (per‑platform
  process walkers), `packages/supervisor/src/state/` (the live
  state map and subagent handling), `packages/supervisor/src/lifecycle/`
  (PID file, signal handling, idempotent auto‑start).