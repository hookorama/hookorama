/**
 * `hookorama dashboard` command.
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

function handle<T>(promise: Promise<T>): Promise<[T, undefined] | [undefined, unknown]> {
  return promise
    .then((data) => [data, undefined] as [T, undefined])
    .catch((error) => [undefined, error] as [undefined, unknown]);
}

async function findPackageRoot(): Promise<string> {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 20; depth += 1) {
    const pkgPath = path.resolve(dir, 'package.json');
    const file = Bun.file(pkgPath);
    const [exists] = await handle(file.exists());
    if (!exists) {
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
      continue;
    }
    const [raw] = await handle(file.text());
    if (typeof raw !== 'string') {
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
      continue;
    }
    const [pkg] = await handle(Promise.resolve().then(() => JSON.parse(raw) as { name?: string }));
    if (pkg?.name === 'hookorama') {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('cannot find hookorama package root');
}

export async function dashboard(): Promise<void> {
  const cliRoot = await findPackageRoot();
  const webAppDir = path.resolve(cliRoot, '..', 'web-app');

  const webAppPkg = Bun.file(path.resolve(webAppDir, 'package.json'));
  const [exists] = await handle(webAppPkg.exists());
  if (!exists) {
    console.error('Hookorama dashboard not found at %s', webAppDir);
    process.exitCode = 1;
    return;
  }

  const child = spawn(process.execPath, ['run', 'dev'], {
    cwd: webAppDir,
    stdio: 'inherit',
    windowsHide: true,
  });

  child.on('error', (err) => {
    console.error('failed to spawn dashboard:', err);
    process.exitCode = 1;
  });

  await new Promise<void>((resolve) => {
    child.on('exit', (code) => {
      process.exitCode = code ?? 1;
      resolve();
    });
  });
}
