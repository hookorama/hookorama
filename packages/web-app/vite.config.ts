import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import tsconfigPaths from 'vite-tsconfig-paths';

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const supervisorDir = path.resolve(projectDir, '../supervisor');

function supervisorPlugin(): Plugin {
  let child: ReturnType<typeof spawn> | null = null;
  return {
    name: 'hookorama:supervisor',
    apply: 'serve',
    async configureServer() {
      child = spawn('bun', ['src/main.ts'], { cwd: supervisorDir });
      child.stderr?.on('data', (data: Buffer) => {
        console.warn(data.toString().trim());
      });
      child.stdout?.on('data', (data: Buffer) => {
        console.warn(data.toString().trim());
      });

      for (let i = 0; i < 50; i++) {
        try {
          const response = await fetch('http://127.0.0.1:7354/api/state');
          if (response.ok) return () => {
            if (child !== null) {
              child.kill();
              child = null;
            }
          };
        } catch {
          // not ready yet
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      console.error('supervisor did not start in time');
    },
  };
}

export default defineConfig({
  plugins: [supervisorPlugin(), react(), tailwindcss(), tsconfigPaths()],
  resolve: {
    alias: {
      '@': path.resolve(projectDir, './src'),
      '@hookorama/client': path.resolve(projectDir, '../client/src/index.ts'),
    },
  },
  server: {
    port: 3000,
    host: '127.0.0.1',
    proxy: {
      '/api': 'http://127.0.0.1:7354',
      '/ws': { target: 'ws://127.0.0.1:7354', ws: true, changeOrigin: true },
    },
  },
});
