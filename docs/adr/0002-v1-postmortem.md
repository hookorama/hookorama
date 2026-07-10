---
id: 0002
title: Post-mortem of v1's two-tier supervisor design and why we rejected it
type: history
status: accepted
created: 2026-07-10
supersedes: []
principles: [P-5]
jobs: [H-1, H-2, H-4]
---

# ADR 0002 — Why no per-window supervisor and no global tier

> **History record.** This ADR is referenced by `0001-supervisor-shape`
> and by every later ADR that touches supervisor shape. It exists so
> we never re‑discover the same failure modes the hard way.

## Context

`vscode-terminal-status-manager` (v1) shipped with two supervisor
tiers, designed across 2025 and 2026:

1. A **per‑window supervisor**, one per VS Code extension
   instance, bound to a Unix socket keyed by workspace folder path.
2. An optional **global supervisor**, installable as an OS
   service, that aggregated state from per‑window supervisors
   for a cross‑window web dashboard.

The architecture produced five concrete failure modes. They are
recorded here so the v2 (Hookorama) design can rebut them
explicitly, and so any future proposal that wants to re‑introduce
either tier must rebut this ADR.

## The five failure modes (v1, observed)

### F1. A per‑window supervisor in window A could not see an agent in window B

The headline failure. A user with two VS Code windows open — one
running Claude Code, one running Devin — saw Claude's status in
window A's status bar only if Claude was running in a terminal
owned by window A. If Claude was running in window B, window A's
status bar showed `idle` (or worse, the status of whichever
terminal happened to be active in window A at the moment). The
user's mental model is **one machine, one picture**; the
architecture gave them **N pictures, one per window**.

### F2. Per‑window socket discovery broke on `Reload Window`

v1's fix for F1 was to key the socket path on the workspace
folder, not on `vscode.env.sessionId` (which changes on `Reload
Window`). But "workspace folder" is not unique either: a user
with two windows on the same folder re‑creates the failure mode.
The fix was a documented trade‑off, not a solution.

### F3. The global supervisor was a second writer

The global supervisor aggregated state from per‑window
supervisors over an HTTP API. But the **live state of a window**
(which terminals are open in which window, with which
`processId`) is not something a global supervisor can know — VS
Code does not publish it cross‑process. The global supervisor
therefore had to maintain a stale mirror or be re‑fed by the
per‑window supervisor on every change. Both introduced bugs.

### F4. The web dashboard could not navigate back

The web dashboard showed aggregated state, but navigation back
to the terminal that needed attention required the per‑window
supervisor to expose a `focusTerminal` command. Some terminals
(CI shells, ad‑hoc shells) had no per‑window supervisor to
focus from. The dashboard could show the problem but not solve
it.

### F5. The per‑window supervisor had no persistent history

Per‑window supervisors were short‑lived. The global supervisor
held some history, but it was a *second writer* and a *coarse*
store (keyed on `cwd`). "What did Claude do yesterday at 3pm"
was literally unanswerable.

## Decision

Hookorama has **one supervisor per machine**, installed as a
**user‑mode local service**, with a **persistent append‑only
SQLite history** (the latter ships in ADR `0003-history-schema`
in PR 3). This ADR supersedes the v1 design.

## Consequences

- The architecture must commit to "one writer, one DB" in every
  later ADR that touches state. Any ADR that proposes a second
  writer must rebut this one.
- The extension is the only place that knows "which terminal
  belongs to which VS Code window". This is a feature, not a
  leak: it lets us add per‑window UX without bloating the
  supervisor with IDE concepts.

### Reversibility

`hard`. Re‑introducing a per‑window tier would re‑introduce F1.
This ADR is the cite‑target for any future "but what if we…"
proposal.

## Open questions

None.

## Traceability

- **Principles:** `P-5`.
- **Jobs:** `H-1`, `H-2`, `H-4`.
- **Superseded design:** v1's per‑window + global supervisors.
- **Files this decision creates / owns:**
  `docs/adr/0002-v1-postmortem.md` (this file).