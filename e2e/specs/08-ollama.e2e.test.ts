import { test, expect } from '@playwright/test';
import { waitForAgent, resetState } from '../lib/api.js';
import { startAgent, sendPrompt, stopAgent } from '../lib/agent.js';

const SESSION = 'ollama-s1';
const PROJECT = 'ollama-demo';
const PROJECT_DIR = '/workspace/ollama-demo';
const AGENT = 'claude-ollama';

test.skip(
  process.env['E2E_MOCK_OLLAMA'] === '1',
  'Ollama is mocked in this run; skipping real Ollama smoke test',
);

test('real Ollama agent goes idle -> thinking -> running-tool -> done', async () => {
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
