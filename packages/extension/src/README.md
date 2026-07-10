# `packages/extension/src/`

The VS Code extension host entry. The single `.ts` file here,
`extension.ts`, is the package's `main` (compiled to `extension.cjs`
by tsdown with `--format cjs`). The package's top-level `README.md`
describes the package; this `src/README.md` describes the entry.

## Layout

- **`extension.ts`** — the extension's `activate` / `deactivate`
  functions, exported. The package's `package.json` `main` points
  here.

The extension's full module structure (status bar, treeview,
webview) lands in later phases. The first phase that adds logic
here will rename this README's content as needed.