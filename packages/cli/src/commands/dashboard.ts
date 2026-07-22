/**
 * `hookorama dashboard` command.
 *
 * Serves the built web-app if it is bundled next to the CLI package, otherwise
 * falls back to running the Vite dev server from the source workspace.
 */

import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import http from 'node:http';
import { createRequire } from 'node:module';
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
    const [fileStat, statErr] = await handle(stat(pkgPath));
    if (statErr !== undefined || !fileStat?.isFile()) {
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
      continue;
    }

    const [raw, readErr] = await handle(readFile(pkgPath, 'utf8'));
    if (readErr !== undefined || typeof raw !== 'string') {
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
      continue;
    }

    const [pkg, parseErr] = await handle(Promise.resolve().then(() => JSON.parse(raw) as { name?: string }));
    if (parseErr !== undefined || pkg?.name !== '@hookorama/cli') {
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
      continue;
    }

    return dir;
  }
  return Promise.reject(new Error('cannot find @hookorama/cli package root'));
}

async function findBuiltWebApp(cliDir: string): Promise<string | undefined> {
  const candidates = [
    path.resolve(cliDir, 'dist', 'web-app'),
    path.resolve(cliDir, '..', 'web-app', 'dist'),
  ];
  for (const dir of candidates) {
    const [fileStat, statErr] = await handle(stat(path.resolve(dir, 'index.html')));
    if (statErr === undefined && fileStat?.isFile()) return dir;
  }
  return undefined;
}

async function findSourceWebApp(cliDir: string): Promise<string | undefined> {
  const dir = path.resolve(cliDir, '..', 'web-app');
  const [fileStat, statErr] = await handle(stat(path.resolve(dir, 'package.json')));
  if (statErr === undefined && fileStat?.isFile()) return dir;
  return undefined;
}

function mimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map = new Map<string, string>([
    ['.html', 'text/html'],
    ['.js', 'application/javascript'],
    ['.mjs', 'application/javascript'],
    ['.css', 'text/css'],
    ['.json', 'application/json'],
    ['.svg', 'image/svg+xml'],
    ['.png', 'image/png'],
    ['.jpg', 'image/jpeg'],
    ['.jpeg', 'image/jpeg'],
    ['.gif', 'image/gif'],
    ['.ico', 'image/x-icon'],
    ['.woff2', 'font/woff2'],
    ['.woff', 'font/woff'],
    ['.ttf', 'font/ttf'],
    ['.otf', 'font/otf'],
  ]);
  return map.get(ext) ?? 'application/octet-stream';
}

function serveStatic(webAppDir: string, port = 3000): void {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? `127.0.0.1:${port}`}`);
    const relative = url.pathname === '/' ? 'index.html' : url.pathname;
    const resolved = path.join(webAppDir, relative);
    const relativeToRoot = path.relative(path.resolve(webAppDir), resolved);
    const forbidden =
      relativeToRoot === '..' ||
      relativeToRoot.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativeToRoot);
    if (forbidden) {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    let target = resolved;
    let [fileStat] = await handle(stat(target));
    if (fileStat?.isDirectory()) {
      target = path.join(resolved, 'index.html');
      [fileStat] = await handle(stat(target));
    }
    if (!fileStat?.isFile()) {
      target = path.join(webAppDir, 'index.html');
      [fileStat] = await handle(stat(target));
    }
    if (!fileStat?.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found');
      return;
    }

    res.writeHead(200, { 'content-type': mimeType(target) });
    createReadStream(target).pipe(res);
  });

  server.listen(port, '127.0.0.1', () => {
    const address = server.address();
    const actualPort = typeof address === 'object' && address !== null ? address.port : port;
    console.warn(`dashboard running at http://127.0.0.1:${actualPort}/`);
  });
}

async function startDevServer(webAppDir: string): Promise<void> {
  const require = createRequire(import.meta.url);
  let viteBin: string;
  try {
    viteBin = require.resolve('vite/bin/vite.js');
  } catch {
    console.error('vite is not installed; cannot start dashboard dev server');
    process.exitCode = 1;
    return;
  }

  const child = spawn(process.execPath, [viteBin], {
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
    path.resolve(cliDir, 'dist', 'web-app'),
  );
  process.exitCode = 1;
}
