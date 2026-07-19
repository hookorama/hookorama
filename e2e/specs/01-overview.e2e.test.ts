import { test, expect } from '@playwright/test';
import { OverviewPage } from '../lib/pages.js';
import { startAgent, sendPrompt, stopAgent } from '../lib/agent.js';
import { resetState } from '../lib/api.js';

let sessionName = '';

const SESSION = 'overview-s1';
const PROJECT = 'overview-demo';
const PROJECT_DIR = '/workspace/overview-demo';

test.describe('overview lifecycle', () => {
  test.beforeAll(async () => {
    await resetState();
    sessionName = await startAgent({
      name: 'claude',
      sessionId: SESSION,
      projectDir: PROJECT_DIR,
      projectId: PROJECT,
      mock: true,
    });
  });

  test.afterAll(async () => {
    await stopAgent(sessionName);
  });

  test('new idle agent appears in overview', async ({ page }) => {
    const overview = new OverviewPage(page);
    await overview.goto();
    await expect(overview.kpiValue('running')).toHaveText('0');
    await expect(overview.kpiValue('attention')).toHaveText('0');
    await overview.kpiTile('projects').waitFor();
  });

  test('agent transitions to thinking and running are reflected', async ({ page }) => {
    const overview = new OverviewPage(page);
    await overview.goto();

    await sendPrompt(sessionName, '!thinking plan the work');
    await expect(overview.kpiValue('running')).toHaveText('1', { timeout: 15000 });

    await sendPrompt(sessionName, '!running-tool search docs');
    await expect(overview.kpiValue('running')).toHaveText('1');

    await sendPrompt(sessionName, '!done');
    await expect(overview.kpiValue('running')).toHaveText('0', { timeout: 15000 });
  });

  test('waiting agent appears in attention queue and notifications KPI', async ({ page }) => {
    const overview = new OverviewPage(page);
    await overview.goto();

    const waitSession = await startAgent({
      name: 'claude',
      sessionId: 'overview-wait',
      projectDir: PROJECT_DIR,
      projectId: PROJECT,
      mock: true,
    });

    await sendPrompt(waitSession, '!wait approve deployment');
    await expect(overview.kpiValue('attention')).toHaveText('1', { timeout: 15000 });
    await expect(overview.attentionItems()).toHaveCount(1);

    await sendPrompt(waitSession, '!error something broke');
    await expect(overview.kpiValue('attention')).toHaveText('1', { timeout: 15000 });

    await stopAgent(waitSession);
  });

  test('shortcuts route to agents, projects and processes', async ({ page }) => {
    const overview = new OverviewPage(page);
    await overview.goto();
    await overview.shortcut('agent tree').click();
    await expect(page).toHaveURL(/\/agents/);
  });
});
