---
id: gh-stackx-for-pr-stacks
type: lesson
tags: [workflow, pr, gh-stack, gh-stackx, stacked-prs]
created: 2026-07-21
summary: Hookorama uses the custom gh extension gh-stackx for stacked PRs; agents should prefer gh stackx over plain gh pr create when branches are stacked.
---

## Rule

When creating, syncing, or merging stacked pull requests in
`hookorama/hookorama`, use the custom `gh` extension `gh-stackx` rather than
plain `gh pr create` / `gh pr merge` directly.

## Applies when

- The repo has multiple dependent branches / a PR stack (for example
  `feat/supervisor-shape` → `feat/wire-web-dashboard` → `feat/cli`).
- You need to submit, sync, or merge a chain of PRs.
- You are about to run `gh pr create` for a branch that builds on another
  feature branch instead of `main`.

## Details

- `gh-stackx` is installed as a `gh` extension. It wraps `github/gh-stack` for
  local stack metadata and overrides the remote operations that require the
  private-preview GitHub Stacked PRs API.
- Key commands:
  - `gh stackx submit [--open]` — pushes the stack and creates/updates PRs via
    `gh pr create` / `gh pr edit`.
  - `gh stackx sync` — runs `gh stack sync` and fixes every PR's `base` branch.
  - `gh stackx merge [--squash|--rebase]` — merges the stack top-down with
    `gh pr merge`.
- New PRs are created as drafts unless `--open` is passed.
- Local stack metadata lives in `.git/gh-stack` and must not be committed.
- Extension source repo: `C:\Users\petrp\Documents\GitHub\gh-stackx`.
