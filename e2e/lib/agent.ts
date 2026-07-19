import { spawnSession, sendKeys, killSession } from '../fixtures/tmux.js';
import { waitForAgent } from './api.js';

export interface AgentOptions {
  readonly name: string;
  readonly sessionId: string;
  readonly projectDir: string;
  readonly projectId: string;
  readonly model?: string;
  readonly skill?: string;
  readonly mock?: boolean;
}

let counter = 0;

export async function startAgent(opts: AgentOptions): Promise<string> {
  const sessionName = `e2e-agent-${++counter}`;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    E2E_AGENT_NAME: opts.name,
    E2E_SESSION_ID: opts.sessionId,
    E2E_PROJECT_DIR: opts.projectDir,
    E2E_PROJECT_ID: opts.projectId,
    E2E_OLLAMA_MODEL: opts.model ?? process.env['E2E_OLLAMA_MODEL'] ?? 'qwen2.5:0.5b',
    E2E_AGENT_SKILL: opts.skill ?? 'e2e',
    E2E_MOCK_OLLAMA: opts.mock === true ? '1' : process.env['E2E_MOCK_OLLAMA'] === '1' ? '1' : '0',
  };

  await killSession(sessionName);
  await spawnSession(sessionName, process.cwd(), ['bun', 'e2e/fixtures/ollama-agent.ts'], env);
  await waitForAgent(opts.sessionId, 'idle', 10000);
  return sessionName;
}

export async function sendPrompt(sessionName: string, text: string): Promise<void> {
  await sendKeys(sessionName, text);
}

export async function stopAgent(sessionName: string): Promise<void> {
  await sendKeys(sessionName, '!done').catch(() => {
    // Agent may already be gone.
  });
  await killSession(sessionName);
}
