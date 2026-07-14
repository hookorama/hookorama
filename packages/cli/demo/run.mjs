#!/usr/bin/env bun
/**
 * One-command local demo for the `hookorama` CLI.
 *
 * 1. Creates an isolated demo home directory so agent configs and the
 *    supervisor PID file do not touch the real `~/.claude` or `~/.config/devin`.
 * 2. Runs `hookorama setup claude` and `hookorama setup devin` against that home.
 * 3. Starts the supervisor.
 * 4. Spawns two fake agents (claude and devin) that register their own
 *    terminal entries and dispatch hook events.
 * 5. Prints `hookorama status` while the agents are "working".
 * 6. Stops the supervisor and cleans up.
 *
 * Run from the repo root:
 *   bun run demo
 * or from packages/cli:
 *   bun run demo
 */

import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';

const demoDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolvePath(demoDir, '..', '..', '..');
const cliMain = resolvePath(demoDir, '..', 'src', 'main.ts');
const demoHome = resolvePath(demoDir, 'home');
const agentsDir = join(demoHome, 'agents');
const readyFile = join(demoHome, '.agents-ready');
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

function startSupervisor() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliMain, 'supervisor', 'start'], {
      cwd: repoRoot,
      env,
      detached: true,
      stdio: 'ignore',
    });

    child.on('error', reject);
    child.on('spawn', () => {
      child.unref();
      resolve(child);
    });
  });
}

function startFakeAgent(agent) {
  const agentDir = join(agentsDir, agent);
  const child = spawn(process.execPath, [resolvePath(demoDir, 'fake-agent.mjs'), agent, readyFile], {
    cwd: agentDir,
    env,
    stdio: 'inherit',
  });

  const exited = new Promise((resolve) => {
    child.on('close', (code) => resolve(code ?? 0));
  });

  return { child, exited };
}

async function registerAgentPids(pids) {
  const terminals = pids.map(([agent, pid]) => ({
    pid,
    cwd: join(agentsDir, agent),
    name: `demo-${agent}`,
  }));

  const response = await fetch(`${httpUrl}/api/terminals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ terminals }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`register terminals failed: ${response.status} ${text}`);
  }
}

async function signalReady() {
  await writeFile(readyFile, '', 'utf8');
}

async function printAgentProcesses() {
  try {
    const response = await fetch(`${httpUrl}/api/processes`);
    if (!response.ok) return;
    const rows = await response.json();
    const agentRows = rows.filter((row) => row.agentId !== undefined);
    console.warn('==> processes owned by demo agents: %d', agentRows.length);
    for (const row of agentRows.slice(0, 6)) {
      console.warn(`    pid=${row.pid} type=${row.type} cmd=${row.cmd}`);
    }
  } catch {
    // ignore
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

  console.warn('==> starting supervisor');
  const supervisor = await startSupervisor();
  await waitForSupervisor();

  const cleanup = async () => {
    try {
      await runCli(['supervisor', 'stop']);
    } catch {
      // best effort
    }
    try {
      supervisor.kill?.();
    } catch {
      // already gone
    }
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  console.warn('==> spawning fake agents');
  const claude = startFakeAgent('claude');
  const devin = startFakeAgent('devin');

  // The supervisor needs to know these PIDs as open terminals so that hook
  // events with --pid resolve to a real process in the OS tree.
  await registerAgentPids([
    ['claude', claude.child.pid],
    ['devin', devin.child.pid],
  ]);
  await signalReady();

  await setTimeout(1500);

  console.warn('\n==> status (agents should be active)');
  await runCli(['status']);
  await printAgentProcesses();

  await setTimeout(2500);

  console.warn('\n==> status again (agents may be finishing)');
  await runCli(['status']);

  console.warn('\n==> waiting for fake agents to finish');
  await Promise.all([claude.exited, devin.exited]);

  console.warn('\n==> stopping supervisor');
  await cleanup();

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
