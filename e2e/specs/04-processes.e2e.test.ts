import { test, expect } from '@playwright/test';
import { ProcessesPage } from '../lib/pages.js';
import { startAgent, sendPrompt, stopAgent } from '../lib/agent.js';
import { resetState } from '../lib/api.js';

let sessionName = '';
const SESSION = 'processes-s1';
const PROJECT = 'processes-demo';
const PROJECT_DIR = '/workspace/processes-demo';

const agentNode = (processes: ProcessesPage) =>
  processes.processNode('bun').filter({ hasText: /agent/i }).first();

test.describe('processes page', () => {
  test.beforeAll(async () => {
    await resetState();
    sessionName = await startAgent({
      name: 'claude',
      sessionId: SESSION,
      projectDir: PROJECT_DIR,
      projectId: PROJECT,
      mock: true,
    });
    await sendPrompt(sessionName, '!wait approve release');
  });

  test.afterAll(async () => {
    await stopAgent(sessionName);
  });

  test('agent process is annotated and linked to the agent', async ({ page }) => {
    const processes = new ProcessesPage(page);
    await processes.goto('/processes');

    const node = agentNode(processes);
    await node.waitFor();
    await node.click();

    await expect(processes.detailsValue('type')).toHaveText('agent');
    await expect(processes.detailsValue('agent')).toHaveText('claude');
  });

  test('type filter hides non-matching processes', async ({ page }) => {
    const processes = new ProcessesPage(page);
    await processes.goto('/processes');

    await processes.typeFilter().selectOption('ide');
    await expect(agentNode(processes)).toHaveCount(0);

    await processes.typeFilter().selectOption('all');
    await expect(agentNode(processes)).toBeVisible();
  });

  test('search filters the process tree', async ({ page }) => {
    const processes = new ProcessesPage(page);
    await processes.goto('/processes');

    await processes.searchInput().fill('nonexistent');
    await expect(agentNode(processes)).toHaveCount(0);

    await processes.searchInput().fill('bun');
    await expect(agentNode(processes)).toBeVisible();
  });
});
