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

function runCommand(command, args, options = {}) {
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string')) {
    throw new TypeError('command args must be an array of strings');
  }

  const isWindows = process.platform === 'win32';
  const child = isWindows
    ? spawn('cmd', ['/c', command, ...args], {
        ...options,
        shell: false,
        stdio: 'inherit',
      })
    : spawn(command, args, {
        ...options,
        shell: false,
        stdio: 'inherit',
      });

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

function runNpm(args, options = {}) {
  return runCommand('npm', args, { cwd: repoRoot, env: process.env, ...options });
}

async function npmLinkCli() {
  console.warn('==> linking hookorama globally via npm');
  await runNpm(['link'], { cwd: resolvePath(repoRoot, 'packages', 'cli') });
}

function runHookorama(args, options = {}) {
  return runCommand('hookorama', args, { cwd: demoHome, env: buildDemoEnv(), ...options });
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
