#!/usr/bin/env bun
/**
 * Copy the built web-app static assets into the CLI package so that the
 * published `hookorama dashboard` command can serve them without requiring the
 * source workspace.
 */

import { cp, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const root = import.meta.dir ? path.resolve(import.meta.dir, '..') : process.cwd();
const src = path.resolve(root, 'packages/web-app/dist');
const dst = path.resolve(root, 'packages/cli/dist/web-app');
const indexHtml = path.resolve(src, 'index.html');

try {
  await stat(indexHtml);
} catch {
  console.error('built web-app not found at %s; run `bun run --cwd packages/web-app build` first', src);
  process.exit(1);
}

await rm(dst, { recursive: true, force: true });
await cp(src, dst, { recursive: true, force: true });
console.log('copied %s -> %s', src, dst);
