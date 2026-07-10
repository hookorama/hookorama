---
name: maintaining-agents-dir
when to use: The agent needs to add, edit, or remove anything under `.agents/` — a memory fact, a retro, a lesson, a rule, a skill, or an update to `RULES.md`.
procedure: |
  1. Read `.agents/RULES.md` and this skill in full before any write.
  2. Classify the work:
     - new memory fact   → `.agents/memory/facts/<id>.md`   (frontmatter `type: fact`)
     - new retro         → `.agents/memory/retros/<id>.md`  (frontmatter `type: retro`, `trigger`, `what went wrong`, `what we change`)
     - new lesson        → `.agents/memory/lessons/<id>.md` (frontmatter `type: lesson`, `rule`, `applies when`)
     - new rule          → `.agents/rules/<name>.md.rule`   + row in `.agents/RULES.md`
     - new skill         → `.agents/skills/<name>/SKILL.md` + row in `.agents/RULES.md`
     - edit of existing  → update the file; reindex if memory; check:md if rules.
  3. For memory entries: pick a kebab-case `id` not yet used for that `type`. Check `.agents/memory/index.tsv` first.
  4. For rules and skills: pick a stable glob; for skills, pick a stable trigger sentence in `when to use`.
  5. After any write: `bun run memory:reindex` (if memory), then `bun run check:md` (always).
outputs:
  - A new or updated file under `.agents/`.
  - An updated `.agents/RULES.md` row, if a new rule or skill was added.
  - An updated `.agents/memory/index.tsv`, if any memory entry was added, edited, or removed.
  - A passing `bun run check:md`.
---

# Skill: maintaining-agents-dir

> **Read this skill when** you need to add or change anything under
> `.agents/`. This is the "I want to add a memory fact / rule / skill"
> procedure. It is the *only* skill agents should load to write into
> `.agents/`.

## Inputs

Before starting, you must have read:

- `AGENTS.md §2` and §3 — the random-file rule and the category table.
- `.agents/RULES.md` — the index of rules for tracked `.md` files.
- `.agents/memory/README.md` — the frontmatter shape for memory entries.

## Procedure

### 1. Memory entries (`facts/`, `retros/`, `lessons/`)

**Pick the subdirectory first.** A fact is something we learned; a retro
is a mistake and how we fixed it; a lesson is a behaviour change.

**Pick the `id`.** kebab-case, unique within `type`. Open
`.agents/memory/index.tsv` (or run `bun run memory:reindex` first if it
is stale) and check that no row already has your chosen `id`.

**Frontmatter (all three subdirs share):**

```yaml
---
id: <kebab>
type: fact | retro | lesson
tags: [kebab, kebab]
created: YYYY-MM-DD
summary: <one sentence under 200 chars>
---
```

**Retros add** `trigger`, `what went wrong`, `what we change` headings
in the body (not frontmatter).

**Lessons add** `rule`, `applies when` headings in the body.

**Reindex.** After the file is written, run `bun run memory:reindex`.
CI runs the same step on every PR.

### 2. Rules (`rules/<name>.md.rule`)

**Pick the path glob.** What `.md` files will this rule cover? Examples:
`AGENTS.md`, `*.md`, `packages/<name>/SPEC.md`, `docs/adr/NNNN-*.md`.

**Required frontmatter:**

```yaml
---
appliesTo: <glob>
purpose: <one sentence>
owner: governance | memory | skills
created: YYYY-MM-DD
---
```

**Body** — short prose explaining the rule, then a `## Template`
block. Keep under ~80 lines.

**Register.** Add a row to `.agents/RULES.md`'s `## Rules index` table.

**Verify.** `bun run check:md` must pass before the PR opens.

### 3. Skills (`skills/<name>/SKILL.md`)

**Pick the trigger.** A skill is activated by name when its `when to
use` matches the agent's current task. A vague or broad `when to use`
defeats the purpose — be specific enough that another agent knows when
to load it.

**Required frontmatter:**

```yaml
---
name: <kebab>
when to use: <one sentence>
procedure: <one-line summary of steps>
outputs: <what the skill produces>
---
```

**Body** — `## Inputs`, `## Procedure` (numbered), `## Outputs`,
`## Done when` (checklist), `## See also`.

**Register.** Add a row to `.agents/RULES.md` with the path glob
`.agents/skills/<name>/SKILL.md` and purpose "procedure: <one-line>".

**Verify.** `bun run check:md` must pass.

### 4. Editing existing files

Re-read the file and its rule. Honour the rule's template and length
cap. After the edit, run `bun run check:md` (always) and
`bun run memory:reindex` (if you touched memory).

## Outputs

- A new or updated `.md` under `.agents/`.
- Possibly a new row in `.agents/RULES.md`.
- Possibly a regenerated `.agents/memory/index.tsv`.
- A passing `bun run check:md`.

## Done when

- [ ] The new entry has the correct frontmatter shape.
- [ ] `.agents/RULES.md` has a row for any new rule/skill.
- [ ] `bun run memory:reindex` has been run if memory was touched.
- [ ] `bun run check:md` is green.

## See also

- `AGENTS.md §2` — the random-file rule.
- `.agents/README.md` — what lives where.
- `.agents/RULES.md` — the rule index.
- `.agents/memory/README.md` — memory frontmatter shape.