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
      const file = Bun.file(pkgPath);
      if (await file.exists()) {
        const raw = await file.text();
        const pkg = JSON.parse(raw) as { name?: string };
        if (pkg.name === 'hookorama') {
          return dir;
        }
      }
    } catch {
      // not a package root or not valid JSON
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
    const webAppPkg = Bun.file(path.resolve(webAppDir, 'package.json'));
    if (!(await webAppPkg.exists())) {
      console.error('Hookorama dashboard not found at %s', webAppDir);
      process.exitCode = 1;
      return;
    }
  } catch {
    console.error('Hookorama dashboard not found at %s', webAppDir);
    process.exitCode = 1;
    return;
  }

  const child = spawn(process.execPath, ['run', 'dev'], {
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
