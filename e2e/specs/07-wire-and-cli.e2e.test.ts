import { test, expect } from '@playwright/test';
import type { ProcessEntry } from '@hookorama/client';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getSnapshot, sendHook, waitForAgent, resetState } from '../lib/api.js';
import { AgentsPage } from '../lib/pages.js';

const execFileAsync = promisify(execFile);

const CLI = 'bun';
const CLI_SCRIPT = path.resolve('packages/cli/dist/main.mjs');
const SESSION = 'wire-s1';
const PROJECT = 'wire-demo';
const PROJECT_DIR = '/workspace/wire-demo';
const AGENT = 'cli-test';

test.describe('wire protocol and CLI', () => {
  test.beforeEach(async () => {
    await resetState();
  });

  test('POST /api/hook updates the supervisor state', async () => {
    await sendHook({
      status: 'thinking',
      cwd: PROJECT_DIR,
      agent: AGENT,
      sessionId: SESSION,
      pidChain: [process.pid],
      metadata: { projectId: PROJECT, model: 'gpt-4', skill: 'wire' },
    });

    const agent = await waitForAgent(SESSION, 'thinking', 10000);
    expect(agent.agent).toBe(AGENT);
  });

  test('GET /api/state returns the created agent', async () => {
    await sendHook({
      status: 'thinking',
      cwd: PROJECT_DIR,
      agent: AGENT,
      sessionId: SESSION,
      pidChain: [process.pid],
      metadata: { projectId: PROJECT, model: 'gpt-4', skill: 'wire' },
    });
    await waitForAgent(SESSION, 'thinking', 10000);

    const snapshot = await getSnapshot();
    const agent = snapshot.entries.find((e: ProcessEntry) => e.sessionId === SESSION);
    expect(agent).toBeDefined();
    expect(agent?.status).toBe('thinking');
  });

  test('CLI hook dispatches an event visible in the dashboard', async ({ page }) => {
    await execFileAsync(CLI, [CLI_SCRIPT, 'hook', 'claude', 'done', '--cwd', PROJECT_DIR, '--pid', String(process.pid), '--session-id', SESSION, '--project-id', PROJECT, '--agent-name', AGENT]);

    const agent = await waitForAgent(SESSION, 'done', 10000);
    expect(agent.status).toBe('done');

    const agentsPage = new AgentsPage(page);
    await agentsPage.goto('/agents');
    await expect(agentsPage.agentNode(AGENT)).toBeVisible({ timeout: 10000 });
  });

  test('CLI status reports the supervisor state', async () => {
    const { stderr } = await execFileAsync(CLI, [CLI_SCRIPT, 'status']);
    expect(stderr).toMatch(/supervisor: connected/);
    expect(stderr).toMatch(/agents:\s+\d+/);
  });

  test('CLI plugin list shows claude and devin', async () => {
    const { stderr } = await execFileAsync(CLI, [CLI_SCRIPT, 'plugin', 'list']);
    expect(stderr).toMatch(/claude:/i);
    expect(stderr).toMatch(/devin:/i);
  });

  test('CLI setup writes an agent hook config', async () => {
    const tmpDir = '/tmp/hookorama-setup';
    const configPath = '/tmp/hookorama-setup/.claude/settings.json';
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(tmpDir, { recursive: true });
    try {
      await execFileAsync(CLI, [CLI_SCRIPT, 'setup', 'claude'], { cwd: tmpDir });
      expect(fs.existsSync(configPath)).toBe(true);
      const content = fs.readFileSync(configPath, 'utf8');
      expect(content).toContain('"hook"');
      expect(content).toContain('"claude"');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
