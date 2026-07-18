#!/usr/bin/env bun
/**
 * Generate the `demo/` local agent config directory.
 *
 * The demo directory contains only the two local project configs:
 *   - `.claude/settings.json`
 *   - `.devin/config.json`
 *
 * The configs call the globally linked `hookorama` CLI (installed via `npm link`).
 */

import { spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolvePath(scriptDir, '..');
const demoHome = resolvePath(repoRoot, 'demo');

function buildDemoEnv() {
  const home = homedir();
  return {
    ...process.env,
    XDG_CACHE_HOME: process.env.XDG_CACHE_HOME || process.env.LOCALAPPDATA || join(home, '.hookorama', 'cache'),
    XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR || process.env.LOCALAPPDATA || join(home, '.hookorama', 'runtime'),
    HOOKORAMA_SELF_COMMAND: 'hookorama',
    HOOKORAMA_SELF_SCRIPT: '',
  };
}

function runScript(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: repoRoot,
      env: process.env,
      stdio: 'inherit',
      ...options,
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`${args.join(' ')} exited with ${code}`));
        return;
      }
      resolve();
    });
  });
}

async function buildDist() {
  console.warn('==> building CLI distribution');
  await runScript(['x', 'tsdown']);
}

function runCommand(command, args, { cwd } = {}) {
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string')) {
    throw new TypeError('command args must be an array of strings');
  }

  const isWindows = process.platform === 'win32';
  // NOSONAR: This demo script runs fixed developer-tool literals (`npm`, `hookorama`)
  // that are resolved through the developer's environment PATH. No user-controlled
  // data is injected into the command line, and `shell: false` prevents shell
  // metacharacter expansion. On Windows we explicitly use the trusted system
  // `cmd.exe` (`%SystemRoot%\System32\cmd.exe`) so `cmd` cannot be shadowed by a
  // writable PATH entry, but the `npm`/`hookorama` .cmd wrappers still rely on
  // PATH for their own resolution. For a local developer-only demo this is an
  // acceptable trade-off; hard-coding absolute install paths would make the demo
  // non-portable across machines and package managers.
  const trustedComSpec = isWindows
    ? join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe')
    : command;
  const child = isWindows
    ? spawn(trustedComSpec, ['/c', command, ...args], { cwd, shell: false, stdio: 'inherit' }) // NOSONAR
    : spawn(command, args, { cwd, shell: false, stdio: 'inherit' }); // NOSONAR

  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`${command} ${args.join(' ')} exited with ${code}`));
        return;
      }
      resolve();
    });
  });
}

function runNpm(args, { cwd } = {}) {
  return runCommand('npm', args, { cwd: cwd ?? repoRoot });
}

async function npmLinkCli() {
  console.warn('==> linking hookorama globally via npm');
  await runNpm(['link'], { cwd: resolvePath(repoRoot, 'packages', 'cli') });
}

function runHookorama(args, { cwd } = {}) {
  const { XDG_CACHE_HOME, XDG_RUNTIME_DIR, HOOKORAMA_SELF_COMMAND, HOOKORAMA_SELF_SCRIPT } = buildDemoEnv();
  process.env.XDG_CACHE_HOME = XDG_CACHE_HOME;
  process.env.XDG_RUNTIME_DIR = XDG_RUNTIME_DIR;
  process.env.HOOKORAMA_SELF_COMMAND = HOOKORAMA_SELF_COMMAND;
  process.env.HOOKORAMA_SELF_SCRIPT = HOOKORAMA_SELF_SCRIPT;
  return runCommand('hookorama', args, { cwd: cwd ?? demoHome });
}

async function prepareDemo() {
  await rm(demoHome, { recursive: true, force: true });
  await mkdir(demoHome, { recursive: true });
}

async function main() {
  await prepareDemo();
  await buildDist();
  await npmLinkCli();

  console.warn('==> installing local agent configs');
  await runHookorama(['setup', 'claude']);
  await runHookorama(['setup', 'devin']);

  console.warn('\n==> configs ready in', demoHome);
  console.warn('    claude:', resolvePath(demoHome, '.claude', 'settings.json'));
  console.warn('    devin: ', resolvePath(demoHome, '.devin', 'config.json'));
  console.warn('\nRun a real agent from this project, e.g.:');
  console.warn(`    cd "${demoHome}"`);
  console.warn('    claude');
  console.warn('    devin');
  console.warn('\nThen in another terminal:');
  console.warn('    hookorama status');
}

try {
  await main();
} catch (error) {
  console.error('demo setup failed:', error);
  process.exitCode = 1;
}
