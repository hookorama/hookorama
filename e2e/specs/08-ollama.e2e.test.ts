import { test, expect } from '@playwright/test';
import { createConnection } from 'node:net';
import { waitForAgent, resetState } from '../lib/api.js';
import { startAgent, sendPrompt, stopAgent } from '../lib/agent.js';

const SESSION = 'ollama-s1';
const PROJECT = 'ollama-demo';
const PROJECT_DIR = '/workspace/ollama-demo';
const AGENT = 'claude-ollama';
const OLLAMA_PORT = 11434;

function isOllamaReachable(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port: OLLAMA_PORT, host: '127.0.0.1' });
    socket
      .once('connect', () => {
        socket.destroy();
        resolve(true);
      })
      .once('error', () => {
        resolve(false);
      });
    socket.setTimeout(2000, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

test.describe('Ollama-backed agent smoke', () => {
  test('real Ollama agent goes idle -> thinking -> running-tool -> done', async () => {
    test.skip(process.env['E2E_MOCK_OLLAMA'] === '1', 'Ollama is mocked in this run');
    test.skip(!(await isOllamaReachable()), 'Ollama service is not reachable on port 11434');

    await resetState();
    const sessionName = await startAgent({
      name: AGENT,
      sessionId: SESSION,
      projectDir: PROJECT_DIR,
      projectId: PROJECT,
      mock: false,
      model: process.env['E2E_OLLAMA_MODEL'] ?? 'qwen2.5:0.5b',
      skill: 'e2e',
    });

    await sendPrompt(sessionName, 'What is 2+2? Answer with a single digit.');

    const agent = await waitForAgent(SESSION, 'done', 120000);
    expect(agent.status).toBe('done');
    expect(agent.metadata?.metrics?.tasks).toBe(1);
    expect(agent.metadata?.metrics?.toolCalls).toBe(1);

    await stopAgent(sessionName);
  });
});
