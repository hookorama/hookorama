# `scripts/` — repo-root tooling

> **What lives here.** Small one-shot helpers that operate on the
> whole repo. These are not product code; if a script outgrows this
> folder (~100 lines of meaningful logic) it deserves its own
> `packages/<name>/` with a `package.json` of its own.

## Layout

- **`scripts/check-md.ts`** — enforces the `.md` rule. Walks
  git-tracked `.md`, asserts each is covered by an `appliesTo`
  glob in `.agents/RULES.md` (or is in the explicit allowlist).
- **`scripts/check-files.ts`** — enforces sibling-`README.md`
  under `packages/`. Walks `packages/**/*.{ts,tsx,json}` and
  asserts each file has a sibling `README.md` or is allowlisted.
- **`scripts/reindex-memory.ts`** — emits
  `.agents/memory/index.tsv` from the frontmatter of every
  memory entry.
- **`scripts/_scratch/`** (gitignored) — throwaway helpers. Move
  out within the same PR or delete.

## What does NOT live here

- **Product logic.** If a script starts to know about Hookorama's
  domain (agents, supervisors, hooks, processes), it is no longer
  a script — it is a package.
- **Persistent state.** Scripts read inputs and produce outputs;
  they do not maintain state across runs.

## Invocation

```bash
bun run check:md       # check:md only
bun run check:files    # check:files only
bun run check          # both
bun run memory:reindex # rebuild memory index.tsv
bun run ci             # typecheck + lint + check + test + build
```

CI runs `bun run ci` on every PR and on `main`.