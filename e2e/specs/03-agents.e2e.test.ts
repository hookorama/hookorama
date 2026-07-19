import { test, expect } from '@playwright/test';
import { AgentsPage } from '../lib/pages.js';
import { startAgent, sendPrompt, stopAgent } from '../lib/agent.js';
import { resetState } from '../lib/api.js';

let sessionName = '';
const SESSION = 'agents-s1';
const PROJECT = 'agents-demo';
const PROJECT_DIR = '/workspace/agents-demo';
const TASK = 'approve deployment';

test.describe('agents page', () => {
  test.beforeAll(async () => {
    await resetState();
    sessionName = await startAgent({
      name: 'claude',
      sessionId: SESSION,
      projectDir: PROJECT_DIR,
      projectId: PROJECT,
      mock: true,
      model: 'qwen2.5:0.5b',
      skill: 'e2e',
    });
    await sendPrompt(sessionName, `!wait ${TASK}`);
  });

  test.afterAll(async () => {
    await stopAgent(sessionName);
  });

  test('agent is visible in the tree and inspector shows details', async ({ page }) => {
    const agents = new AgentsPage(page);
    await agents.goto('/agents');

    const node = agents.agentNode(TASK);
    await node.waitFor();
    await agents.selectAgent(TASK);

    await expect(agents.inspectorValue('session')).toHaveText(SESSION);
    await expect(agents.inspectorValue('model')).toHaveText('qwen2.5:0.5b');
    await expect(agents.inspectorValue('skill')).toHaveText('e2e');
    await expect(agents.inspectorValue('origin')).toHaveText('terminal');
    await expect(agents.approveButton()).toBeVisible();
  });

  test('search filters the agent tree', async ({ page }) => {
    const agents = new AgentsPage(page);
    await agents.goto('/agents');

    await agents.searchInput().fill('nonexistent');
    await expect(agents.agentNode(TASK)).toHaveCount(0);

    await agents.searchInput().fill(TASK);
    await expect(agents.agentNode(TASK)).toHaveCount(1);
  });

  test('status filter toggles visibility', async ({ page }) => {
    const agents = new AgentsPage(page);
    await agents.goto('/agents');

    await agents.filterButton('waiting-input').click();
    await expect(agents.agentNode(TASK)).toHaveCount(0);

    await agents.filterButton('waiting-input').click();
    await expect(agents.agentNode(TASK)).toHaveCount(1);
  });

  test('group by session reorganizes the tree', async ({ page }) => {
    const agents = new AgentsPage(page);
    await agents.goto('/agents');

    await agents.groupSelect().selectOption('session');
    await expect(page.getByTestId('group-header').filter({ hasText: SESSION })).toBeVisible();
  });
});
