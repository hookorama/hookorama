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
    async configureServer(server) {
      try {
        const response = await fetch('http://127.0.0.1:7354/api/state');
        if (response.ok) {
          console.warn('supervisor already running on http://127.0.0.1:7354/');
          return;
        }
      } catch {
        // not running yet, start it
      }

      child = spawn(process.execPath, ['src/main.ts'], { cwd: supervisorDir });

      let childExited = false;
      let childExitCode: number | null = null;
      child.on('exit', (code) => {
        childExited = true;
        childExitCode = code;
      });

      child.stderr?.on('data', (data: Buffer) => {
        console.warn(data.toString().trim());
      });
      child.stdout?.on('data', (data: Buffer) => {
        console.warn(data.toString().trim());
      });

      for (let i = 0; i < 50; i++) {
        if (childExited) {
          throw new Error(`supervisor exited with code ${childExitCode ?? 'unknown'}`);
        }
        try {
          const response = await fetch('http://127.0.0.1:7354/api/state');
          if (response.ok) break;
        } catch {
          // not ready yet
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      if (childExited) {
        throw new Error(`supervisor exited with code ${childExitCode ?? 'unknown'}`);
      }

      const originalClose = server.close.bind(server);
      server.close = async () => {
        if (child !== null) {
          try {
            child.kill();
          } catch (err) {
            console.warn('failed to kill supervisor:', err);
          }
          child = null;
        }
        await originalClose();
      };
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
