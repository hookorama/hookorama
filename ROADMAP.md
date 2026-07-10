# ROADMAP.md — phases

> Read `AGENTS.md` §3 before extending this document. Each phase
> row is justified by at least one ADR in `docs/adr/`.

| Phase | ADR(s) | Component(s) | Status |
|-------|--------|--------------|--------|
| Phase 0 — Bootstrap | (none — tooling only) | (none — no components shipped) | shipped |
| Phase 1 — Supervisor | `docs/adr/0001-supervisor-shape.md` | Supervisor | shipped (this PR) |
| Phase 2 — Wire protocol | (planned; ADR to open with that PR) | Wire protocol, Supervisor (consumes it) | planned |
| Phase 3 — CLI | (planned) | CLI | planned |
| Phase 4 — VS Code extension | (planned) | Extension | planned |
| Phase 5 — Web dashboard | (planned) | Web app | planned |
| Phase 6 — MCP server | (planned) | MCP | planned |
| Phase 7 — Multi‑IDE | (planned) | Extension (other IDEs) | planned |
| Phase 8 — Analytics + cost guardrails + adoption score | (planned; formulas pinned by ADRs in that PR) | Analytics, Cost guardrails | planned |