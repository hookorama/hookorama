# Changelog

All notable changes to this project are documented in this file.
The format follows [keep-a-changelog](https://keepachangelog.com/).

## [0.2.0] — 2026-07-10

PR: https://github.com/hookorama/hookorama/pull/2

ADR: [`docs/adr/0001-supervisor-shape.md`](./docs/adr/0001-supervisor-shape.md)

### Added

- Component: **Supervisor** (one row in `SPEC.md`).
- ADR: `0001-supervisor-shape` — identity model (`pidChain` → cwd
  fallback → `session_id` enrichment), in‑memory state schema,
  lifecycle (one supervisor per machine, user‑mode local service),
  single‑writer contract. Replaces v1's two‑tier design.
- Supervisor entry point at `packages/supervisor/src/main.ts`
  (NDJSON Unix socket / named pipe; PID file at
  `$XDG_RUNTIME_DIR/hookorama/supervisor.pid`; SIGTERM
  → SIGKILL after 10s; idempotent auto‑start on first client
  connection).
- Process discovery for Linux (`/proc`), macOS (`ps`), and Windows
  (`wmic`/`tasklist` fallback).
- Identity resolution: PID‑first, with `cwd` and `session_id` as
  enrichment (P‑2 from `docs/NORTH-STAR.md`).
- Memory fact: `.agents/memory/facts/pid-chain-beats-session-id.md`.

### Changed

- `packages/supervisor/src/index.ts` is no longer a placeholder; it
  re‑exports the real public API from `./main.ts`.

## [0.1.0] — 2026-07-10

PR: https://github.com/hookorama/hookorama/pull/1

### Added

- Initial bootstrap: bun workspaces + tsdown workspace build,
  TypeScript strict (TS 7, ES2024, Node 24), oxlint, prettier,
  vitest.
- Agent contract at `AGENTS.md` (read‑first order, the `.md` rule,
  role‑boundary, invariants).
- 20 `.agents/rules/*.md.rule` files + `.agents/RULES.md` index
  enforcing "no random `.md` files".
- Two repo‑local skills: `navigating-project-docs`,
  `maintaining-agents-dir`.
- Memory layer (markdown‑only, no DB): `facts/`, `retros/`,
  `lessons/`, with frontmatter and `index.tsv` reindex.
- Three repo‑root scripts: `check-md`, `check-files`,
  `reindex-memory`.
- CI workflow at `.github/workflows/ci.yml`.
- Five empty package skeletons: `@hookorama/client`,
  `@hookorama/supervisor`, `hookorama` (CLI),
  `@hookorama/extension`, `@hookorama/web-app`.