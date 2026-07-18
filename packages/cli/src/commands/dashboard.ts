/**
 * `hookorama dashboard` command.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

async function findPackageRoot(): Promise<string> {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  while (true) {
    const pkgPath = path.join(dir, 'package.json');
    if (existsSync(pkgPath)) {
      const raw = await readFile(pkgPath, 'utf8');
      const pkg = JSON.parse(raw) as { name?: string };
      if (pkg.name === 'hookorama') {
        return dir;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error('cannot find hookorama package root');
    }
    dir = parent;
  }
}

export async function dashboard(): Promise<void> {
  const cliRoot = await findPackageRoot();
  const webAppDir = path.resolve(cliRoot, '..', 'web-app');

  if (!existsSync(webAppDir)) {
    console.error('Hookorama dashboard not found at %s', webAppDir);
    process.exitCode = 1;
    return;
  }

  const child = spawn('bun', ['run', 'dev'], {
    cwd: webAppDir,
    stdio: 'inherit',
    windowsHide: true,
  });

  await new Promise<void>((resolve) => {
    child.on('exit', (code) => {
      process.exitCode = code ?? 1;
      resolve();
    });
  });
}
