/**
 * Resolve the command needed to run this CLI from another process.
 *
 * When the CLI is run as `bun packages/cli/src/main.ts` we want agents to
 * call the same script. When it is the built `dist/main.mjs` we want that.
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Return the executable runtime path (Bun) and the CLI script path.
 *
 * `HOOKORAMA_SELF_COMMAND` (and optional `HOOKORAMA_SELF_SCRIPT`) override the
 * command so agent configs can call a global runtime (e.g. `bun`) linked to a
 * local wrapper script (e.g. `demo/hookorama.mjs`).
 */
export function getSelfCommand(): { readonly runtime: string; readonly script: string } {
  const overrideCommand = process.env['HOOKORAMA_SELF_COMMAND'];
  if (overrideCommand !== undefined && overrideCommand.length > 0) {
    return { runtime: overrideCommand, script: process.env['HOOKORAMA_SELF_SCRIPT'] ?? '' };
  }

  const runtime = process.execPath;
  const argv1 = process.argv[1] ?? '';
  const script =
    argv1.length > 0
      ? resolve(argv1)
      : fileURLToPath(new URL('./main.mjs', import.meta.url));
  return { runtime, script };
}

function escapeShellArg(path: string): string {
  // Forward slashes are safe for PowerShell, cmd and bash on Windows.
  const withForwardSlashes = path.replaceAll('\\', '/');
  // Escape double quotes, dollar signs, backticks, and backslashes inside a
  // double-quoted shell argument to prevent command injection.
  const escaped = withForwardSlashes.replace(/["$`\\]/g, '\\$&');
  return `"${escaped}"`;
}

/** Return the command string for use in agent configs. */
export function getSelfCommandString(): string {
  const { runtime, script } = getSelfCommand();
  if (script === '') {
    return escapeShellArg(runtime);
  }
  return `${escapeShellArg(runtime)} ${escapeShellArg(script)}`;
}
