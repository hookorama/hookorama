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
      switch (label) {
        case 'overview':
          await expect(page).toHaveURL(/\/$/);
          break;
        case 'projects':
          await expect(page).toHaveURL(/\/projects/);
          break;
        case 'agents':
          await expect(page).toHaveURL(/\/agents/);
          break;
        case 'processes':
          await expect(page).toHaveURL(/\/processes/);
          break;
        case 'events':
          await expect(page).toHaveURL(/\/events/);
          break;
        case 'analytics':
          await expect(page).toHaveURL(/\/analytics/);
          break;
        default:
          break;
      }
    }
  });
});
