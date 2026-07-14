---
id: workspace-tsc-needs-tsdown-first
type: fact
tags: [monorepo, tsdown, tsc, workspace, build]
created: 2026-07-14
summary: `tsc -b` cannot resolve workspace packages until tsdown has emitted their `dist/` exports.
---

# `tsc -b` needs `tsdown` first for this workspace

The workspace packages (`@hookorama/client`, `@hookorama/supervisor`, etc.)
use `package.json` `exports` that point at `dist/*.mjs` and `dist/*.d.mts`.
`tsdown` is the tool that generates those files.

Running `tsc -p packages/cli/tsconfig.json` (or `tsc -b` in a clean tree)
therefore fails with `Cannot find module '@hookorama/client'` unless the
workspace packages have already been built. The root `typecheck` script is
`tsdown && tsc -b --noEmit ...` for exactly this reason.

If you see workspace-resolution errors in a fresh worktree, run `bun run tsdown`
(or `bun run typecheck`) before investigating the code.
