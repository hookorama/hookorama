import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import tsconfigPaths from 'vite-tsconfig-paths';

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const supervisorDir = path.resolve(projectDir, '../supervisor');
const supervisorHost = '127.0.0.1';
const supervisorPort = 7354;

function isPortReachable(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection(supervisorPort, supervisorHost);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => {
      resolve(false);
    });
  });
}

function supervisorPlugin(): Plugin {
  let child: ReturnType<typeof spawn> | null = null;
  return {
    name: 'hookorama:supervisor',
    apply: 'serve',
    async configureServer(server) {
      if (await isPortReachable()) {
        console.warn(`supervisor already running on ${supervisorHost}:${supervisorPort}/`);
        return;
      }

      child = spawn(process.execPath, ['src/main.ts'], { cwd: supervisorDir });

      let spawnErr: Error | undefined;
      child.on('error', (err) => {
        spawnErr = err;
      });
      child.stderr?.on('data', (data: Buffer) => {
        console.warn(data.toString().trim());
      });
      child.stdout?.on('data', (data: Buffer) => {
        console.warn(data.toString().trim());
      });

      for (let i = 0; i < 50; i++) {
        if (spawnErr !== undefined) {
          return Promise.reject(new Error(`supervisor failed to start: ${spawnErr.message}`));
        }
        if (child.exitCode !== null) {
          return Promise.reject(new Error(`supervisor exited with code ${child.exitCode}`));
        }
        if (await isPortReachable()) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      if (spawnErr !== undefined) {
        return Promise.reject(new Error(`supervisor failed to start: ${spawnErr.message}`));
      }
      if (child.exitCode !== null) {
        return Promise.reject(new Error(`supervisor exited with code ${child.exitCode}`));
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
