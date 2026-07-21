import { test, expect } from '@playwright/test';
import { ProjectsPage } from '../lib/pages.js';
import { startAgent, sendPrompt, stopAgent } from '../lib/agent.js';
import { resetState } from '../lib/api.js';

let sessionName = '';
const SESSION = 'projects-s1';
const PROJECT = 'projects-demo';
const PROJECT_DIR = '/workspace/projects-demo';

test.describe('projects', () => {
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

  test('project appears with agent, wait and cost metrics', async ({ page }) => {
    const projects = new ProjectsPage(page);
    await projects.goto('/projects');

    const row = projects.projectRow(PROJECT);
    await row.waitFor();
    await expect(projects.projectStat(row, 'agents')).toHaveText('1');
    await expect(projects.projectStat(row, 'run')).toHaveText('0');
    await expect(projects.projectStat(row, 'wait')).toHaveText('1');
    await expect(projects.projectStat(row, 'tasks')).toHaveText('0');
    await expect(projects.projectStat(row, 'cost')).toHaveText('$0.000');

    await row.click();
    await expect(page).toHaveURL(/\/agents/);
  });
});
