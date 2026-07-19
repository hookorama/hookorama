import { test, expect } from '@playwright/test';
import { AnalyticsPage } from '../lib/pages.js';
import { startAgent, sendPrompt, stopAgent } from '../lib/agent.js';
import { resetState, waitForAgent } from '../lib/api.js';

let sessionName = '';
const SESSION = 'analytics-s1';
const PROJECT = 'analytics-demo';
const PROJECT_DIR = '/workspace/analytics-demo';
const AGENT = 'claude-analytics';

const runTask = async () => {
  await sendPrompt(sessionName, 'hello');
  await waitForAgent(SESSION, 'done', 15000);
};

test.describe('analytics page', () => {
  test.beforeEach(async () => {
    await resetState();
    sessionName = await startAgent({
      name: AGENT,
      sessionId: SESSION,
      projectDir: PROJECT_DIR,
      projectId: PROJECT,
      mock: true,
      model: 'qwen2.5:0.5b',
      skill: 'e2e',
    });
  });

  test.afterEach(async () => {
    await stopAgent(sessionName);
  });

  test('KPIs, rollup, top agents, skills and models are populated', async ({ page }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto('/analytics');
    await runTask();

    await expect(analytics.kpiValue('tasks')).toHaveText('1', { timeout: 15000 });
    await expect(analytics.kpiValue('calls')).toHaveText('1');
    await expect(analytics.kpiValue('active')).toHaveText('0');

    const rollup = analytics.rollupRow(PROJECT);
    await rollup.waitFor();
    await expect(rollup).toContainText('1'); // agents
    await expect(rollup).toContainText('$0.000'); // cost

    await expect(analytics.topAgentRow(AGENT)).toContainText('1');
    await expect(analytics.skillRow('e2e')).toContainText('1');
    await expect(analytics.modelRow('qwen2.5:0.5b')).toContainText('1');

    await expect(analytics.adoptionScore()).toHaveText(/\d+/);
    await expect(analytics.usageRows().last()).toContainText('$0.000');
  });

  test('project filter updates the view', async ({ page }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto('/analytics');
    await runTask();

    await analytics.projectFilter(PROJECT).click();
    await expect(analytics.kpiValue('tasks')).toHaveText('1');

    await analytics.projectFilterAll().click();
    await expect(analytics.kpiValue('tasks')).toHaveText('1');
  });

  test('range selector stays active', async ({ page }) => {
    const analytics = new AnalyticsPage(page);
    await analytics.goto('/analytics');

    await analytics.rangeButton('7d').click();
    await expect(analytics.rangeButton('7d')).toHaveAttribute('class', /border-primary/);
  });
});
