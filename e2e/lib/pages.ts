import { type Page, type Locator, expect } from '@playwright/test';

const CONNECTION_PATTERNS = {
  live: /live/i,
  offline: /offline/i,
  error: /error/i,
};

export class Dashboard {
  constructor(protected readonly page: Page) {}

  async goto(path = '/'): Promise<void> {
    await this.page.goto(path);
    await expect(this.connectionBadge()).toHaveText(/live/i, { timeout: 15000 });
  }

  connectionBadge(): Locator {
    return this.page.getByTestId('connection-badge');
  }

  async expectConnection(status: 'live' | 'offline' | 'error'): Promise<void> {
    await expect(this.connectionBadge()).toHaveText(CONNECTION_PATTERNS[status]);
  }

  headerAgents(): Locator {
    return this.page.getByTestId('header-agents');
  }

  headerCost(): Locator {
    return this.page.getByTestId('header-cost');
  }

  nav(label: 'overview' | 'projects' | 'agents' | 'processes' | 'events' | 'analytics'): Locator {
    return this.page.getByTestId(`nav-${label}`);
  }

  async navigateTo(label: 'overview' | 'projects' | 'agents' | 'processes' | 'events' | 'analytics'): Promise<void> {
    await this.nav(label).click();
  }
}

export class OverviewPage extends Dashboard {
  kpiTile(label: string): Locator {
    return this.page.getByTestId('kpi-tile').filter({ hasText: label }).first();
  }

  kpiValue(label: string): Locator {
    return this.kpiTile(label).getByTestId('kpi-tile-value');
  }

  attentionItems(): Locator {
    return this.page.getByTestId('attention-item');
  }

  shortcut(title: string): Locator {
    return this.page.getByTestId(`shortcut-${title}`);
  }
}

export class ProjectsPage extends Dashboard {
  projectRow(id: string): Locator {
    return this.page.getByTestId(`project-row-${id}`);
  }

  projectStat(row: Locator, label: string): Locator {
    return row.getByTestId(`stat-${label}`);
  }
}

export class AgentsPage extends Dashboard {
  searchInput(): Locator {
    return this.page.getByTestId('agent-search');
  }

  groupSelect(): Locator {
    return this.page.getByTestId('agent-group-select');
  }

  sortSelect(): Locator {
    return this.page.getByTestId('agent-sort-select');
  }

  filterButton(name: string): Locator {
    return this.page.getByRole('button', { name, exact: true }).first();
  }

  agentNode(name: string): Locator {
    return this.page.getByTestId('agent-node').filter({ hasText: name }).first();
  }

  async selectAgent(name: string): Promise<void> {
    await this.agentNode(name).click();
  }

  inspectorValue(label: string): Locator {
    return this.page.getByTestId('agent-inspector').getByTestId(`agent-inspector-${label.toLowerCase()}`);
  }

  approveButton(): Locator {
    return this.page.getByTestId('approve-button');
  }
}

export class ProcessesPage extends Dashboard {
  searchInput(): Locator {
    return this.page.getByTestId('process-search');
  }

  typeFilter(): Locator {
    return this.page.getByTestId('process-type-filter');
  }

  processNode(cmd: string): Locator {
    return this.page.getByTestId('process-node').filter({ hasText: cmd });
  }

  async selectProcess(cmd: string): Promise<void> {
    await this.processNode(cmd).click();
  }

  detailsValue(label: string): Locator {
    return this.page.getByTestId('process-details').getByTestId(`process-detail-${label.toLowerCase()}`);
  }

  focusVsCodeButton(): Locator {
    return this.page.getByRole('button', { name: 'focus vscode' }).first();
  }
}

export class EventsPage extends Dashboard {
  searchInput(): Locator {
    return this.page.getByTestId('event-search');
  }

  typeFilter(): Locator {
    return this.page.getByTestId('event-type-filter');
  }

  followCheckbox(): Locator {
    return this.page.getByTestId('event-follow');
  }

  eventRow(summary: string): Locator {
    return this.page.getByTestId('event-row').filter({ hasText: summary }).first();
  }

  async selectEvent(summary: string): Promise<void> {
    await this.eventRow(summary).click();
  }

  payload(): Locator {
    return this.page.getByTestId('event-payload');
  }
}

export class AnalyticsPage extends Dashboard {
  rangeButton(range: '24h' | '7d' | '30d'): Locator {
    return this.page.getByTestId(`range-${range}`);
  }

  projectFilterAll(): Locator {
    return this.page.getByTestId('project-filter-all');
  }

  projectFilter(name: string): Locator {
    return this.page.getByTestId('project-filter-button').filter({ hasText: name }).first();
  }

  kpiValue(label: string): Locator {
    return this.page.getByTestId('kpi').filter({ hasText: label }).first().getByTestId('kpi-value');
  }

  rollupRow(name: string): Locator {
    return this.page.getByTestId('project-rollup-row').filter({ hasText: name }).first();
  }

  topAgentRow(name: string): Locator {
    return this.page.getByTestId('top-agent-row').filter({ hasText: name }).first();
  }

  skillRow(name: string): Locator {
    return this.page.getByTestId('skill-row').filter({ hasText: name }).first();
  }

  modelRow(name: string): Locator {
    return this.page.getByTestId('model-row').filter({ hasText: name }).first();
  }

  usageRows(): Locator {
    return this.page.getByTestId('usage-row');
  }

  adoptionScore(): Locator {
    return this.page.getByTestId('adoption-score');
  }
}
