# `@hookorama/extension`

The VS Code extension. The only package in the monorepo that may
import from `vscode`. Talks to the supervisor over its NDJSON
socket and renders the status bar / treeview / webview.

This package is a placeholder in PR 1 (the bootstrap). Real
implementation lands in Phase 4 once the supervisor and the wire
protocol exist.

## Public API

The package is consumed by VS Code via its `main` field. It does
not export a programmatic API.

```jsonc
// package.json "main"
"./dist/extension.cjs"
```

> No extension code yet. The `activate` / `deactivate` stubs land
> in Phase 4.

## Pinned by

- ADR(s): not yet; this package is a placeholder
- Rules: `.agents/rules/package-readme.md.rule`
- Skills: none