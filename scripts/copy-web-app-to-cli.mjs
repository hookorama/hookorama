#!/usr/bin/env bun
/**
 * Copy the built web-app static assets into the CLI package so that the
 * published `hookorama dashboard` command can serve them without requiring the
 * source workspace.
 *
 * Run from the repository root (the `build` script does this).
 */

import { cp, rm } from 'node:fs/promises';

const src = 'packages/web-app/dist';
const dst = 'packages/cli/dist/web-app';

await rm(dst, { recursive: true, force: true });

try {
  await cp(src, dst, { recursive: true, force: true });
} catch (err) {
  if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
    console.error('built web-app not found at %s; run `bun run --cwd packages/web-app build` first', src);
  } else {
    console.error('failed to copy web-app:', err);
  }
  process.exit(1);
}

console.log('copied %s -> %s', src, dst);
