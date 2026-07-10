import { defineConfig } from 'tsdown';

// The VS Code extension host loads CommonJS only, so the extension
// builds to CJS even though every other package in this monorepo
// ships ESM. The entry is `src/extension.ts` (not the typical
// `src/index.ts`) because the VS Code host expects a single file
// exporting `activate` / `deactivate`.
export default defineConfig({
  entry: ['src/extension.ts'],
  format: ['cjs'],
  dts: true,
});