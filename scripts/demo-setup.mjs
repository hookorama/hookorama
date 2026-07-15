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
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolvePath(scriptDir, '..');
const demoHome = resolvePath(repoRoot, 'demo');

function buildDemoEnv() {
  return {
    ...process.env,
    XDG_CACHE_HOME: process.env.XDG_CACHE_HOME || process.env.LOCALAPPDATA || process.env.TEMP,
    XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR || process.env.TEMP,
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

function runNpm(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', args, {
      cwd: repoRoot,
      env: process.env,
      shell: true,
      stdio: 'inherit',
      ...options,
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`npm ${args.join(' ')} exited with ${code}`));
        return;
      }
      resolve();
    });
  });
}

async function npmLinkCli() {
  console.warn('==> linking hookorama globally via npm');
  await runNpm(['link'], { cwd: resolvePath(repoRoot, 'packages', 'cli') });
}

function runHookorama(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('hookorama', args, {
      cwd: demoHome,
      env: buildDemoEnv(),
      shell: true,
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

main().catch((error) => {
  console.error('demo setup failed:', error);
  process.exitCode = 1;
});
