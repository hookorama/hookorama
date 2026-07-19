import { test, expect } from '@playwright/test';
import { EventsPage } from '../lib/pages.js';
import { startAgent, sendPrompt, stopAgent } from '../lib/agent.js';
import { resetState } from '../lib/api.js';

let sessionName = '';
const SESSION = 'events-s1';
const PROJECT = 'events-demo';
const PROJECT_DIR = '/workspace/events-demo';
const AGENT = 'claude-events';

const thinkingSummary = `${AGENT} is thinking`;
const runningToolSummary = `${AGENT} is running-tool`;
const doneSummary = `${AGENT} is done`;

test.describe('events page', () => {
  test.beforeEach(async () => {
    await resetState();
    sessionName = await startAgent({
      name: AGENT,
      sessionId: SESSION,
      projectDir: PROJECT_DIR,
      projectId: PROJECT,
      mock: true,
    });
  });

  test.afterEach(async () => {
    await stopAgent(sessionName);
  });

  test('lifecycle events appear in the stream', async ({ page }) => {
    const events = new EventsPage(page);
    await events.goto('/events');

    await sendPrompt(sessionName, '!thinking plan');
    await expect(events.eventRow(thinkingSummary)).toBeVisible({ timeout: 15000 });

    await sendPrompt(sessionName, '!running-tool search');
    await expect(events.eventRow(runningToolSummary)).toBeVisible({ timeout: 15000 });

    await sendPrompt(sessionName, '!done');
    await expect(events.eventRow(doneSummary)).toBeVisible({ timeout: 15000 });
  });

  test('search filters events by summary', async ({ page }) => {
    const events = new EventsPage(page);
    await events.goto('/events');

    await sendPrompt(sessionName, '!thinking plan');
    await expect(events.eventRow(thinkingSummary)).toBeVisible({ timeout: 15000 });

    await events.searchInput().fill('nonexistent');
    await expect(events.eventRow(thinkingSummary)).toHaveCount(0);

    await events.searchInput().fill('thinking');
    await expect(events.eventRow(thinkingSummary)).toHaveCount(1);
  });

  test('clicking an event shows its payload', async ({ page }) => {
    const events = new EventsPage(page);
    await events.goto('/events');

    await sendPrompt(sessionName, '!thinking plan');
    await expect(events.eventRow(thinkingSummary)).toBeVisible({ timeout: 15000 });
    await events.selectEvent(thinkingSummary);
    await expect(events.payload()).toContainText('"model"');
  });
});
