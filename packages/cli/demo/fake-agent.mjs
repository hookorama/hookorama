#!/usr/bin/env bun
/**
 * Fake agent process used by the local CLI demo.
 *
 * Dispatches a tiny lifecycle: thinking -> running-tool -> thinking -> done.
 * `hookorama hook` auto-starts the supervisor on the first call and
 * resolves the agent's pid against the OS process table.
 */

import { spawn } from 'node:child_process';
import { dirname, resolve as resolvePath } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const agent = process.argv[2] || 'claude';
const cwd = process.cwd();
const cliMain = process.env.HOOKORAMA_CLI || resolvePath(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'main.ts');

function runHook(status, extra = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [cliMain, 'hook', agent, status, '--pid', String(process.pid), '--cwd', cwd, ...extra],
      {
        cwd,
        env: process.env,
        stdio: 'inherit',
      },
    );

    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`hook ${status} exited with ${code}`));
        return;
      }
      resolve();
    });
  });
}

async function main() {
  await runHook('thinking');
  await setTimeout(1200);
  await runHook('running-tool', ['--task', 'demo-task', '--model', 'fake-model']);
  await setTimeout(1200);
  await runHook('thinking');
  await setTimeout(800);
  await runHook('done');
}

main().catch((error) => {
  console.error(`[${agent}] fake agent failed:`, error);
  process.exitCode = 1;
});
