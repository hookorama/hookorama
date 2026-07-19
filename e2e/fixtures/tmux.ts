/**
 * Thin wrapper around `tmux` for spawning the E2E agent in a real terminal
 * and sending it keystrokes.
 */

import { spawn } from 'node:child_process';

const SAFE_PATH = '/usr/local/bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';

function runTmux(args: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('tmux', args, { stdio: 'ignore', env: { PATH: SAFE_PATH } });
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

function envArgs(env: NodeJS.ProcessEnv): string[] {
  const args: string[] = [];
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string') {
      args.push('-e', `${key}=${value}`);
    }
  }
  return args;
}

export async function spawnSession(
  name: string,
  cwd: string,
  command: readonly string[],
  env?: NodeJS.ProcessEnv,
): Promise<void> {
  const sessionArgs = env ? envArgs(env) : [];
  await runTmux(['new-session', '-d', '-s', name, '-c', cwd, ...sessionArgs, ...command]);
}

export async function sendKeys(name: string, text: string): Promise<void> {
  await runTmux(['send-keys', '-l', '-t', name, `${text}\n`]);
}

export async function killSession(name: string): Promise<void> {
  await runTmux(['kill-session', '-t', name]).catch(() => {
    // Session may already be gone.
  });
}
