/**
 * Resolve the command needed to run this CLI from another process.
 *
 * When the CLI is run as `bun packages/cli/src/main.ts` we want agents to
 * call the same script. When it is the built `dist/main.mjs` we want that.
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Return the executable runtime path (Bun) and the CLI script path. */
export function getSelfCommand(): { readonly runtime: string; readonly script: string } {
  const runtime = process.execPath;
  const script =
    process.argv[1] !== undefined && process.argv[1].length > 0
      ? resolve(process.argv[1])
      : fileURLToPath(new URL('./main.mjs', import.meta.url));
  return { runtime, script };
}

/** Return a shell-quoted string `bun "<script>"` for use in agent configs. */
export function getSelfCommandString(): string {
  const { runtime, script } = getSelfCommand();
  return `"${runtime}" "${script}"`;
}
