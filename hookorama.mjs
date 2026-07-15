import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptFile = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptFile);
const main = resolve(scriptDir, '..', 'packages', 'cli', 'src', 'main.ts');

// Point process.argv at the real CLI entry point so Commander, getSelfCommand,
// and ensureSupervisor all see the packages/cli main script.
process.argv[1] = main;

await import(pathToFileURL(main).href);
