---
id: agent-project-config-paths
type: fact
tags: [agents, config, claude, devin]
created: 2026-07-15
summary: Claude Code reads project hooks from `.claude/settings.json`; Devin CLI reads project hooks from `.devin/config.json`.
---

Both Claude Code and Devin CLI support project-scoped hook configs in the current working directory.

- Claude Code: project settings are `.claude/settings.json` (and `.claude/settings.local.json` for local overrides).
- Devin CLI: project settings are `.devin/config.json` (and `.devin/config.local.json` for local overrides).

This means `hookorama setup` should write hook configs to those project-relative paths, not to user home directories.
