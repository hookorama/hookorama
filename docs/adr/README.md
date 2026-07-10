# docs/adr/ — Architecture Decision Records

> **What this folder is.** The index of product and architecture
> decisions about **components or features** of Hookorama. Each
> ADR pins one choice and the rejected alternatives.
>
> **What an ADR is NOT.** A description of the repo, a
> build-tooling choice, a process, an invariant, or a code-style
> rule. Those live elsewhere (see `AGENTS.md §3`).
>
> **Until the first real ADR ships, this folder contains only
> this README.** Any numbered ADR added in PR 1 is a regression —
> reject the PR.

## When to write one

Write an ADR when you are adding any of:

- a **new package** (e.g. `packages/mcp` for the MCP server);
- a **new wire frame** (NDJSON socket, HTTP+WS, IPC, …);
- a **new state machine** (process identity, agent lifecycle,
  cost guardrail, adoption score, …);
- a **new persistence shape** (SQLite schema, retention policy,
  migration approach, …);
- a **new surface** (a new route, a new CLI command, a new MCP
  tool, …);
- a **new cost model** or **new adoption-score formula**;
- any **change to existing architecture** that a future
  contributor would benefit from seeing justified.

Do **not** write an ADR for:

- "we use bun + tsdown" — that is tooling, lives in
  `tsdown.config.ts` + `AGENTS.md`;
- "we use oxlint, not eslint" — tooling;
- "we use prettier" — tooling;
- "we use vitest" — tooling;
- any code style or lint rule change;
- any bug fix (use a memory retro instead);
- any documentation typo.

## The format

Numbered `NNNN-<slug>.md`, four digits. The template:

```markdown
---
id: NNNN
title: <one line>
type: <component | feature | runtime | contract | history | governance>
status: proposed | accepted | superseded | deprecated
created: YYYY-MM-DD
supersedes: []
principles: [P-1, …]
jobs: [H-1, …]
---

# ADR NNNN — <Title>

## Context

What is the situation that forces a decision?

## Decision

What did we choose?

## Consequences

### Positive

### Negative

### Reversibility

easy | medium | hard | irreversible

## Alternatives considered

## Open questions

## Traceability

- Mission: …
- Principles: P-1, …
- Jobs: H-1, …
- SPEC.md (component row): …
- ROADMAP.md phase: …
- Files this decision creates / owns: …
```

The template ships in the same PR as its first user. Until then,
copy the shape above by hand.

## Lifecycle

- **`proposed`** — the PR that contains it is open for review.
- **`accepted`** — the PR is merged.
- **`superseded`** — a later ADR replaces it; the new ADR has a
  `supersedes: [NNNN]` field. The old ADR stays readable and
  points to its successor.
- **`deprecated`** — the decision is no longer relevant because
  the feature was removed. The ADR is moved out of this folder.

Nothing is ever deleted silently.

## How this relates to other files

| File | What it does | What ADR is for |
|---|---|---|
| `AGENTS.md` | Contract. What every agent must do. | Is not created or modified by ADRs. |
| `.agents/skills/*/SKILL.md` | Procedures. How to do recurring tasks. | Is not for procedure; skills pin "how", ADRs pin "what". |
| `.agents/memory/facts/*.md` | Facts we learned. | Each fact may be cited by an ADR's "Consequences" section. |
| `.agents/memory/retros/*.md` | Retrospectives on mistakes. | A retro may justify a new ADR ("we did X and it broke; ADR NNNN says we no longer do X"). |
| `SPEC.md` (PR 2+) | Component index. | Each ADR that ships a component gets one row in `SPEC.md` in the same PR. |
| `ROADMAP.md` (PR 2+) | Ordered list of phases. | Each phase row cites the ADRs it ships. |

## See also

- `AGENTS.md §3` — the file-category table.
- `.agents/skills/navigating-project-docs/SKILL.md` — procedure
  to read or update this folder.