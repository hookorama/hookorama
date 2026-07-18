#!/usr/bin/env bun
/**
 * Copy the built web-app static assets into the CLI package so that the
 * published `hookorama dashboard` command can serve them without requiring the
 * source workspace.
 *
 * Run from the repository root (the `build` script does this).
 */

import { cp, rm, rename } from 'node:fs/promises';

const src = 'packages/web-app/dist';
const dst = 'packages/cli/dist/web-app';
const tmp = `${dst}.tmp`;

await rm(tmp, { recursive: true, force: true });

try {
  await cp(src, tmp, { recursive: true, force: true });
} catch (err) {
  if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
    console.error('built web-app not found at %s; run `bun run --cwd packages/web-app build` first', src);
  } else {
    console.error('failed to copy web-app:', err);
  }
  await rm(tmp, { recursive: true, force: true });
  process.exit(1);
}

try {
  await rm(dst, { recursive: true, force: true });
  await rename(tmp, dst);
} catch (err) {
  console.error('failed to replace dashboard bundle:', err);
  try {
    await cp(tmp, dst, { recursive: true, force: true });
  } catch {
    // ignore secondary errors; the original failure is what matters
  }
  await rm(tmp, { recursive: true, force: true });
  process.exit(1);
}

console.log('copied %s -> %s', src, dst);
