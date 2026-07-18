import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/main.ts'],
  exports: {
    bin: { hookorama: './src/main.ts' },
    exclude: ['main'],
  },
});