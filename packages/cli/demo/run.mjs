#!/usr/bin/env bun
/**
 * One-command local demo for the `hookorama` CLI.
 *
 * 1. Creates an isolated demo home directory so agent configs and the
 *    supervisor PID file do not touch the real `~/.claude` or `~/.config/devin`.
 * 2. Runs `hookorama setup claude` and `hookorama setup devin` against that home.
 * 3. Spawns two fake agents. Their first `hookorama hook` call auto-starts
 *    the supervisor, and the supervisor resolves their pids via the OS
 *    process table when the extension is not running.
 * 4. Prints `hookorama status` while the agents are "working".
 * 5. Stops the supervisor.
 *
 * Run from the repo root:
 *   bun run demo
 * or from packages/cli:
 *   bun run demo
 */

import { spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';

const demoDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolvePath(demoDir, '..', '..', '..');
const cliMain = resolvePath(demoDir, '..', 'src', 'main.ts');
const demoHome = resolvePath(demoDir, 'home');
const agentsDir = join(demoHome, 'agents');
const httpUrl = 'http://127.0.0.1:7354';
const supervisorUrl = `${httpUrl}/api/state`;

const env = buildDemoEnv();

function buildDemoEnv() {
  const localAppData = join(demoHome, 'AppData', 'Local');
  const cacheDir = join(demoHome, '.cache');
  const configDir = join(demoHome, '.config');

  return {
    ...process.env,
    HOME: demoHome,
    USERPROFILE: demoHome,
    LOCALAPPDATA: localAppData,
    XDG_CONFIG_HOME: configDir,
    XDG_CACHE_HOME: cacheDir,
    XDG_RUNTIME_DIR: cacheDir,
    HOOKORAMA_CLI: cliMain,
    HOOKORAMA_DEMO: '1',
  };
}

function runCli(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliMain, ...args], {
      cwd: repoRoot,
      env,
      stdio: 'inherit',
      ...options,
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`hookorama ${args.join(' ')} exited with ${code}`));
        return;
      }
      resolve();
    });
  });
}

function startFakeAgent(agent) {
  const agentDir = join(agentsDir, agent);
  const child = spawn(process.execPath, [resolvePath(demoDir, 'fake-agent.mjs'), agent], {
    cwd: agentDir,
    env,
    stdio: 'inherit',
  });

  const exited = new Promise((resolve) => {
    child.on('close', (code) => resolve(code ?? 0));
  });

  return { child, exited };
}

async function waitForAgents(count) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(supervisorUrl, { signal: AbortSignal.timeout(500) });
      if (response.ok) {
        const { entries } = await response.json();
        if (Array.isArray(entries) && entries.filter((e) => e.status !== 'done').length >= count) {
          return;
        }
      }
    } catch {
      // not ready yet
    }
    await setTimeout(200);
  }
}

async function waitForSupervisor() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(supervisorUrl, { signal: AbortSignal.timeout(500) });
      if (response.ok) return;
    } catch {
      // not ready yet
    }
    await setTimeout(200);
  }
  throw new Error('supervisor did not start in time');
}

async function waitForSupervisorStopped() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(supervisorUrl, { signal: AbortSignal.timeout(500) });
      if (!response.ok) return;
    } catch {
      return;
    }
    await setTimeout(200);
  }
}

async function prepareDemoHome() {
  await rm(demoHome, { recursive: true, force: true });

  const dirs = [
    join(demoHome, '.cache'),
    join(demoHome, 'AppData', 'Local'),
    join(demoHome, '.config'),
    join(demoHome, '.claude'),
    join(demoHome, 'agents', 'claude'),
    join(demoHome, 'agents', 'devin'),
  ];

  for (const dir of dirs) {
    await mkdir(dir, { recursive: true });
  }
}

async function main() {
  await prepareDemoHome();

  console.warn('==> installing local agent configs');
  await runCli(['setup', 'claude']);
  await runCli(['setup', 'devin']);

  console.warn('==> spawning fake agents (supervisor will auto-start on first hook)');
  const claude = startFakeAgent('claude');
  const devin = startFakeAgent('devin');

  await waitForSupervisor();
  await waitForAgents(2);

  console.warn('\n==> status (agents should be active)');
  await runCli(['status']);

  await setTimeout(2500);

  console.warn('\n==> status again (agents may be finishing)');
  await runCli(['status']);

  console.warn('\n==> waiting for fake agents to finish');
  await Promise.all([claude.exited, devin.exited]);

  console.warn('\n==> stopping supervisor');
  await runCli(['supervisor', 'stop']);
  await waitForSupervisorStopped();

  console.warn('\n==> demo complete — inspect configs in packages/cli/demo/home/');
}

main().catch(async (error) => {
  console.error('demo failed:', error);
  try {
    await runCli(['supervisor', 'stop']);
  } catch {
    // ignore
  }
  process.exitCode = 1;
});
