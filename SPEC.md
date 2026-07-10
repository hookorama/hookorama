# SPEC.md — Hookorama component index

> Read `AGENTS.md` and `docs/adr/README.md` before extending this
> document. Rows are added by the PR that introduces the component;
> pre‑written rows are forbidden.

| Component | Package(s) | ADR(s) | Rule(s) | Skill(s) | Memory facts |
|-----------|-----------|--------|---------|----------|--------------|
| Supervisor | `packages/supervisor`, `packages/client` (wire types only) | `docs/adr/0001-supervisor-shape.md` | `package-readme.md.rule` | none | `facts/pid-chain-beats-session-id.md` (added by this PR) |