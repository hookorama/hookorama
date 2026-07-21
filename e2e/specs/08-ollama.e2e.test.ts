import { test, expect } from '@playwright/test';
import { waitForAgent, resetState } from '../lib/api.js';
import { startAgent, sendPrompt, stopAgent } from '../lib/agent.js';

const SESSION = 'ollama-s1';
const PROJECT = 'ollama-demo';
const PROJECT_DIR = '/workspace/ollama-demo';
const AGENT = 'claude-ollama';

test('real Ollama agent completes a task and reports metrics', async () => {
  const mockOllama = process.env['E2E_MOCK_OLLAMA'] === '1';
  test.skip(mockOllama, 'Ollama is mocked in this run; skipping real Ollama smoke test'); // NOSONAR

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

  try {
    await sendPrompt(sessionName, 'What is 2+2? Answer with a single digit.');

    const agent = await waitForAgent(SESSION, 'done', 120000);
    expect(agent.status).toBe('done');
    expect(agent.metadata?.metrics?.tasks).toBe(1);
    expect(agent.metadata?.metrics?.toolCalls).toBe(1);
  } finally {
    await stopAgent(sessionName);
  }
});
