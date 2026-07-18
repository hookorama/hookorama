---
name: act-train
when to use: The user invokes `/act train`, `/act loop`, or asks to run a stacked-PR merge train — applying `/act` to each PR bottom-up and merging once clean.
procedure: Run `bun .agents/skills/act-train/scripts/train.mjs`. If it exits 2, load `/act` on the reported PR, fix it, then re-run the script. Repeat until all PRs are merged.
outputs: A fully merged stack, or the identity of the first dirty PR that needs `/act`.
---

# Skill: `act-train`

Stacked-PR merge train. Walks the current `gh-stack` from the bottom. For each
open PR it checks `mergeStateStatus`, review decision, and unresolved review
threads. If the PR is clean, it merges with `merge_method=merge` and deletes the
head branch so the next PR is automatically retargeted. If the PR is dirty, it
stops and reports the PR, so the operator can run `/act pr <number>` on it and
try the train again.

## Inputs

- `gh` authenticated and able to merge in the repo.
- `gh stackx` extension installed and the current directory is inside a tracked
  stack.
- `/act` skill (global or repo-local) available for the dirty PRs.
- Patience: after each merge, GitHub may take a moment to retarget the next PR
  to `main` once the base branch is deleted.

## Procedure

1. Ensure you are on the top branch of the stack (the script uses `gh stackx
   view --json`, not the current branch, but being on the top avoids local
   branch deletion surprises).
2. Run the train script:
   ```bash
   bun .agents/skills/act-train/scripts/train.mjs
   ```
   Use `--dry-run` to only report what it would merge.
3. If the script exits `0`, every stacked PR was merged. Done.
4. If the script exits `2`, it prints the first dirty PR and why. Load the
   `/act` skill for that PR and follow it to completion (fix code, reply in
   threads, resolve, push until CI green).
5. Re-run the script. It will pick up the now-clean PR, merge it, and continue
   to the next one.
6. Repeat until the script exits `0`.

## Outputs

- Merged stack, or a clear pointer to the PR that needs `/act`.

## Done when

- `gh stackx view` shows no open PRs, or
- the train script exits `0` and reports `All stacked PRs are merged. Done.`
