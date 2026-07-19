import { test, expect } from '@playwright/test';
import { Dashboard } from '../lib/pages.js';
import { resetState } from '../lib/api.js';

test.describe('connection and navigation', () => {
  test.beforeAll(async () => {
    await resetState();
  });
  test('dashboard loads with a live connection', async ({ page }) => {
    const dashboard = new Dashboard(page);
    await dashboard.goto();
    await dashboard.expectConnection('live');
    await expect(dashboard.headerAgents()).toHaveText(/agents\s+\d+\/\d+/i);
    await expect(dashboard.headerCost()).toHaveText(/\$[\d.]+/i);
  });

  test('sidebar navigates between all routes', async ({ page }) => {
    const dashboard = new Dashboard(page);
    await dashboard.goto();

    const routes: Array<'overview' | 'projects' | 'agents' | 'processes' | 'events' | 'analytics'> = [
      'overview',
      'projects',
      'agents',
      'processes',
      'events',
      'analytics',
    ];

    for (const label of routes) {
      await dashboard.navigateTo(label);
      const expected = label === 'overview' ? /\/$/ : new RegExp(`/${label}`);
      await expect(page).toHaveURL(expected);
    }
  });
});
