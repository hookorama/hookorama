/**
 * `hookorama dashboard` command.
 *
 * Serves the built web-app if it is bundled next to the CLI package, otherwise
 * falls back to running the Vite dev server from the source workspace.
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

function handle<T>(promise: Promise<T>): Promise<[T, undefined] | [undefined, unknown]> {
  return promise
    .then((data) => [data, undefined] as [T, undefined])
    .catch((error) => [undefined, error] as [undefined, unknown]);
}

async function findCliPackageDir(): Promise<string> {
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
    if (pkg?.name === '@hookorama/cli') {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return Promise.reject(new Error('cannot find @hookorama/cli package root'));
}

async function findBuiltWebApp(cliDir: string): Promise<string | undefined> {
  const candidates = [
    path.resolve(cliDir, 'web-app'),
    path.resolve(cliDir, '..', '..', 'web-app', 'dist'),
  ];
  for (const dir of candidates) {
    const index = Bun.file(path.resolve(dir, 'index.html'));
    if (await index.exists()) return dir;
  }
  return undefined;
}

async function findSourceWebApp(cliDir: string): Promise<string | undefined> {
  const candidates = [
    path.resolve(cliDir, '..', '..', 'web-app'),
    path.resolve(cliDir, '..', '..', '..', 'packages', 'web-app'),
  ];
  for (const dir of candidates) {
    const pkg = Bun.file(path.resolve(dir, 'package.json'));
    if (await pkg.exists()) return dir;
  }
  return undefined;
}

function mimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
  };
  return map[ext] ?? 'application/octet-stream';
}

function serveStatic(webAppDir: string, port = 3000): void {
  const server = Bun.serve({
    port,
    hostname: '127.0.0.1',
    async fetch(req) {
      const url = new URL(req.url);
      const relative = url.pathname === '/' ? 'index.html' : url.pathname;
      const resolved = path.join(webAppDir, relative);
      const forbidden = !resolved.startsWith(path.resolve(webAppDir));
      if (forbidden) {
        return new Response('Forbidden', { status: 403 });
      }

      let file = Bun.file(resolved);
      let stat = await file.stat().catch(() => undefined);
      if (stat?.isDirectory()) {
        file = Bun.file(path.join(resolved, 'index.html'));
        stat = await file.stat().catch(() => undefined);
      }
      if (!stat?.isFile()) {
        file = Bun.file(path.join(webAppDir, 'index.html'));
        stat = await file.stat().catch(() => undefined);
      }
      if (!stat?.isFile()) {
        return new Response('Not found', { status: 404 });
      }
      return new Response(file, {
        headers: { 'content-type': mimeType(file.name ?? '') },
      });
    },
  });
  console.warn(`dashboard running at http://127.0.0.1:${server.port}/`);
}

async function startDevServer(webAppDir: string): Promise<void> {
  const child = spawn(process.execPath, ['run', 'dev'], {
    cwd: webAppDir,
    stdio: 'inherit',
    windowsHide: true,
  });
  return new Promise<void>((resolve, reject) => {
    child.on('error', (err) => {
      console.error('failed to spawn dashboard dev server:', err);
      reject(err);
    });
    child.on('exit', (code) => {
      process.exitCode = code ?? 1;
      resolve();
    });
  });
}

export async function dashboard(): Promise<void> {
  const cliDir = await findCliPackageDir();
  const builtDir = await findBuiltWebApp(cliDir);

  if (builtDir) {
    serveStatic(builtDir);
    return;
  }

  const sourceDir = await findSourceWebApp(cliDir);
  if (sourceDir) {
    console.warn('built web-app not found; starting Vite dev server from %s', sourceDir);
    await startDevServer(sourceDir);
    return;
  }

  console.error(
    'Hookorama dashboard not found. Expected a built web-app at %s, or a source workspace nearby. Run `bun run build` to bundle it.',
    path.resolve(cliDir, 'web-app'),
  );
  process.exitCode = 1;
}
