// Why bun workspaces + tsdown:
//   - bun workspaces give us a fast monorepo with one lockfile and
//     `bun --filter` for per-package tasks. v1 used pnpm + nx; we do
//     not need nx's task graph here because the package set is
//     shallow and fixed.
//   - tsdown with `workspace: true` builds every workspace package
//     in one invocation, emits ESM + .d.ts, cleans per-package, and
//     respects `deps.neverBundle` for `vscode` (extension host) and
//     `ws` (peer). Each package owns its `tsdown.config.ts` so its
//     entry, format, and target are pinned locally; the root config
//     inherits nothing per-package and just enables workspace mode.
// This file is tooling, not architecture. Tooling choices live here
// and in package.json. Architecture decisions live in docs/adr/.
import { defineConfig } from 'tsdown';

export default defineConfig({
  workspace: true,
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node24',
  platform: 'node',
  exports: true,
  deps: {
    neverBundle: ['vscode', 'ws'],
  },
});