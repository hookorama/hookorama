/**
 * `hookorama dashboard` command.
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

async function findPackageRoot(): Promise<string> {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const pkgPath = path.resolve(dir, 'package.json');
    try {
      const pkg = (await import(pkgPath, { with: { type: 'json' } })) as {
        default?: { name?: string };
      };
      if (pkg.default?.name === 'hookorama') {
        return dir;
      }
    } catch {
      // not a package root or not JSON
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

  try {
    await import(path.resolve(webAppDir, 'package.json'), { with: { type: 'json' } });
  } catch {
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
