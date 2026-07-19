/**
 * Thin wrapper around `tmux` for spawning the E2E agent in a real terminal
 * and sending it keystrokes.
 */

import { spawn } from 'node:child_process';

function runTmux(args: readonly string[], env?: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('tmux', args, { stdio: 'ignore', env });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`tmux ${args.join(' ')} exited with ${code}`));
      }
    });
  });
}

export async function spawnSession(
  name: string,
  cwd: string,
  command: readonly string[],
  env?: NodeJS.ProcessEnv,
): Promise<void> {
  const envArgs: string[] = [];
  if (env) {
    for (const [key, value] of Object.entries(env)) {
      if (value !== undefined) envArgs.push(`${key}=${String(value)}`);
    }
  }
  await runTmux(['new-session', '-d', '-s', name, '-c', cwd, 'env', ...envArgs, ...command]);
}

export async function sendKeys(name: string, text: string): Promise<void> {
  await runTmux(['send-keys', '-l', '-t', name, `${text}\n`]);
}

export async function killSession(name: string): Promise<void> {
  await runTmux(['kill-session', '-t', name]).catch(() => {
    // Session may already be gone.
  });
}
