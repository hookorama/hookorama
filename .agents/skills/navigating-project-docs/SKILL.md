---
name: navigating-project-docs
when to use: The agent needs to read or update any project documentation file outside `.agents/` (e.g. `AGENTS.md`, `README.md`, `docs/adr/README.md`, future `SPEC.md`, future `ROADMAP.md`, future `CHANGELOG.md`, or any `.md` under `docs/`).
procedure: |
  1. Read `AGENTS.md` (root) and `.agents/RULES.md` before any write.
  2. Decide which file category the work belongs to:
     - Agent contract → `AGENTS.md`. Update with care; this is the read-first file.
     - Repo-root pointer → `README.md`.
     - Product/architecture decision → open a new ADR in `docs/adr/NNNN-<slug>.md`.
     - Component index row (PR 2+) → edit `SPEC.md` if it exists. If it does not, write the first product ADR first; `SPEC.md` and `CHANGELOG.md` ship in that PR.
     - Phase → edit `ROADMAP.md` if it exists. If it does not, write the first product ADR first; `ROADMAP.md` ships in that PR.
  3. Before writing a new tracked `.md` that does not yet exist:
     - Check `.agents/RULES.md` for the matching `Path glob`.
     - If no row matches, load `.agents/skills/maintaining-agents-dir/SKILL.md` to write the rule first.
     - Once the rule and the row are in place, write the file.
  4. Before editing an existing `.md`:
     - Open it, skim the rule that governs it (find by glob in `.agents/RULES.md`).
     - Honour the rule's template and constraints.
     - Keep the new version under the rule's recommended length (most rules cap at ~80–120 lines).
  5. After any write:
     - `bun run check:md`.
     - If you edited memory indirectly (ADR cites a new memory fact), run `bun run memory:reindex`.
outputs:
  - An updated or new `.md` file.
  - An updated `.agents/RULES.md` row, if a new tracked `.md` was added.
  - A passing `bun run check:md`.
---

# Skill: navigating-project-docs

> **Read this skill when** you need to find or write any project
> documentation file that lives outside `.agents/`. This skill is the
> "where does this doc go, and what do I read first?" procedure.

## Inputs

Before starting, you must have read:

- `AGENTS.md` (root) — the contract.
- `.agents/RULES.md` — the index of rules for tracked `.md` files.
- `docs/adr/README.md` — what an ADR is and when to write one.

You should also have read `.agents/skills/maintaining-agents-dir/SKILL.md`
if your task involves adding a new tracked `.md` (this skill defers to
that one for the rule-writing part of the work).

## Procedure

### 1. Identify the category

| You want to… | Go to |
|---|---|
| Change how agents must behave, or update read-first order, or update invariants. | Edit `AGENTS.md`. Re-read §3 first. |
| Update the repo-root pointer or status table. | Edit `README.md`. |
| Pin a product/architecture decision about a component or feature. | Open a new ADR. See `docs/adr/README.md`. |
| Add a row to the component index, or update an existing one. | Edit `SPEC.md` (PR 2+). |
| Move a phase forward, or add a new one. | Edit `ROADMAP.md` (PR 2+). |
| Add a new kind of `.md` file that doesn't exist yet. | This is either a new category (requires an ADR justifying it) or a misread of the existing categories (read `AGENTS.md §3` again). |

### 2. Honour the rule

Every `.md` you touch (or create) has a rule in `.agents/RULES.md`. The
rule tells you:

- what the file's purpose is (and what it is not);
- the frontmatter shape (if any);
- a recommended length cap;
- the template (if any);
- the relationship to other files.

Find the rule by scanning the `Path glob` column in `.agents/RULES.md`
for a match against your target file.

### 3. Read the existing file before editing

Always read the current version before editing it. If the file does not
exist yet (creating a new tracked `.md`), the rule's `Template` block
shows the shape.

### 4. After the edit

- Run `bun run check:md`. If you added a new tracked `.md`, the script
  will fail until you also update `.agents/RULES.md`.
- Run `bun run memory:reindex` if you added or changed any
  `.agents/memory/` entry (this is unlikely for navigating-project-docs
  work, but if your edit cites a new memory fact, the index needs it).
- Run `bun run check:files` if you added a new tracked `.ts`/`.tsx`
  under `packages/`.

## Outputs

- An updated or new `.md` file that passes `bun run check:md`.
- Possibly a new row in `.agents/RULES.md`.
- Possibly a new memory entry (rare for this skill).

## Done when

- [ ] `bun run check:md` is green.
- [ ] The PR template's "New `.md` rules added" field is accurate.
- [ ] Any ADR the change cites is updated to point at the new file.

## See also

- `AGENTS.md §2` — the `.md` rule (random-file prevention).
- `AGENTS.md §3` — the file-category table.
- `.agents/skills/maintaining-agents-dir/SKILL.md` — how to write the
  rule and the row in `.agents/RULES.md` that permit a new tracked
  `.md`.
- `docs/adr/README.md` — when to open an ADR.