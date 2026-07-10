# `.agents/memory/` — the agent's shared knowledge

> **What this is.** A flat store of facts, retros, and lessons that
> agents and humans accumulate while working on the repo. Every
> entry is a tracked `.md` with required frontmatter, so the index
> (`index.tsv`) can be `grep`ed cheaply. There are no embeddings,
> no DB — just text, frontmatter, and a `tsv` index.
>
> **Why markdown only.** The agent's context is text; the agent's
> recall is `grep`. A flat folder of small `.md` files with
> stable frontmatter is exactly the shape that lets an agent
> recall prior work without spinning up infrastructure.

## Layout

```
.agents/memory/
├── README.md (this file)
├── facts/    — non-obvious facts we learned
├── retros/   — retrospectives on mistakes
├── lessons/  — behaviour-changing lessons
└── index.tsv — generated; never edit by hand
```

## Frontmatter shape (all three subdirs share)

```yaml
---
id: <kebab-case, unique within type>
type: fact | retro | lesson
tags: [kebab, kebab]
created: YYYY-MM-DD
summary: <one sentence under 200 chars>
---
```

- `id` — kebab-case, unique within `type`. Example:
  `pidChain-beats-sessionId`.
- `type` — `fact`, `retro`, or `lesson`. Each lives in its own
  subdir; cross-type ids can collide.
- `tags` — array of kebab tokens. Reuse existing tags where
  possible; check the index first.
- `summary` — single sentence; the agent should be able to make
  a decision from this line alone.

## Body shape

- **facts** — free prose. Keep the body under ~30 lines.
- **retros** — required body headings: `## Trigger`,
  `## What went wrong`, `## What we change`.
- **lessons** — required body headings: `## Rule`,
  `## Applies when`.

## Reindex

```bash
bun run memory:reindex
```

Walks this folder, parses frontmatter, writes `index.tsv`. Run it
after every add/edit/remove; CI runs the same step on every PR.
The format of `index.tsv` is `path\tid\ttype\ttags\tcreated\tsummary`.

## When to write an entry

- **Fact** — you learned something non-obvious that future work
  should remember (e.g. "the agent's session_id changes across
  /clear; do not key identity on it").
- **Retro** — something went wrong in a way worth recording so
  the same mistake does not repeat.
- **Lesson** — you are about to change your behaviour going
  forward because of something you learned. Lessons are
  prescriptive; facts are observational; retros are corrective.

## When NOT to write an entry

- The thing is already covered by an ADR.
- The thing is obvious from the code or from `AGENTS.md`.
- The thing is a one-off observation with no future relevance.

The procedure for adding an entry is in
`.agents/skills/maintaining-agents-dir/SKILL.md`.