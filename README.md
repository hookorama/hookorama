# Hookorama

A local supervisor for LLM and CLI agents. Agents (Claude Code,
Devin, Codex, …) call into Hookorama through their own hook
mechanism; Hookorama turns those calls into a single, observable
picture of what is happening on the machine — across every agent,
every IDE, every terminal.

> This repository is in the bootstrap phase. There is no product
> code yet; there is a monorepo, a governance contract, a rule
> registry, a memory layer, and a CI gate. The first product
> component (the supervisor) lands in PR 2.

## Start here

- **`AGENTS.md`** — the agent contract. Read it before doing
  anything in the repo. It is short and prescriptive.
- **`.agents/RULES.md`** — the index of rules that govern every
  tracked `.md`.
- **`.agents/skills/`** — procedures for recurring tasks.
- **`docs/adr/`** — product/architecture decision records.

## Status

| Item | State |
|---|---|
| Monorepo | bun workspaces + tsdown workspace build |
| Governance | `AGENTS.md` + `.agents/RULES.md` + `.agents/rules/` |
| Memory | `.agents/memory/{facts,retros,lessons}/` + `index.tsv` reindex |
| CI | `bun run ci` — typecheck, lint, check:md, check:files, test, build |
| Packages | five empty skeletons: `client`, `supervisor`, `cli`, `extension`, `web-app` |
| Components shipped | **none yet** |

## License

MIT — see [`LICENSE`](./LICENSE).