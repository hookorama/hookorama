---
id: sysutils-ps-version
type: fact
tags: [dependencies, sysutils, ps]
created: 2026-07-20
summary: "@sysutils/ps 1.2.0 shipped a broken tarball missing shared chunks; use ^1.2.1 or later in Hookorama."
---

`@sysutils/ps@1.2.1` is the first usable release for Hookorama.

- `1.2.1` fixed the `files` array in `packages/ps/package.json` so that the
  hashed `types-*.mjs` and `proc-*.mjs` chunks `dist/index.mjs` imports are
  included in the published tarball.
- `1.2.0` fails at runtime with `Cannot find module './types-...mjs'`.

Hookorama pins the dependency at `^1.2.0` in `packages/supervisor/package.json`,
so the lockfile (`bun.lock`) must resolve to `>= 1.2.1`.
