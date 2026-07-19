#!/usr/bin/env bun
/**
 * E2E agent fixture: a real terminal process that reads prompts from stdin,
 * optionally calls Ollama, and dispatches Hookorama lifecycle hooks.
 */

import { createInterface } from 'node:readline';
import type { HookRequest, Status } from '@hookorama/client';

const httpUrl = process.env['E2E_SUPERVISOR_URL'] ?? 'http://127.0.0.1:7354';
const ollamaUrl = process.env['E2E_OLLAMA_URL'] ?? 'http://127.0.0.1:11434';
const model = process.env['E2E_OLLAMA_MODEL'] ?? 'qwen2.5:0.5b';
const mock = process.env['E2E_MOCK_OLLAMA'] === '1';
const name = process.env['E2E_AGENT_NAME'] ?? 'claude';
const sessionId = process.env['E2E_SESSION_ID'] ?? 'session-1';
const projectDir = process.env['E2E_PROJECT_DIR'] ?? '/workspace/demo';
const projectId = process.env['E2E_PROJECT_ID'] ?? 'demo';
const skill = process.env['E2E_AGENT_SKILL'] ?? 'e2e';
const origin = process.env['E2E_AGENT_ORIGIN'] ?? 'terminal';

const COST_PER_CALL = 0.0001;

let tasks = 0;
let toolCalls = 0;
let errors = 0;
let cost = 0;

interface HookPayload {
  currentTask?: string | undefined;
  waitingReason?: string | undefined;
}

async function dispatch(status: Status, payload: HookPayload = {}): Promise<void> {
  const metrics =
    tasks > 0 || toolCalls > 0 || cost > 0 || errors > 0
      ? { tasks, toolCalls, cost, errors }
      : undefined;

  const request: HookRequest = {
    status,
    cwd: projectDir,
    agent: name,
    sessionId,
    pidChain: [process.pid],
    metadata: {
      model,
      skill,
      projectId,
      origin,
      ...(payload.currentTask !== undefined ? { currentTask: payload.currentTask } : {}),
      ...(payload.waitingReason !== undefined ? { waitingReason: payload.waitingReason } : {}),
      ...(metrics !== undefined ? { metrics } : {}),
    },
  };

  const response = await fetch(`${httpUrl}/api/hook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    console.error('hook dispatch failed:', response.status);
    process.exitCode = 1;
  }
}

async function callOllama(prompt: string): Promise<string> {
  if (mock) {
    return 'ok';
  }

  const response = await fetch(`${ollamaUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt, stream: false }),
  });

  if (!response.ok) {
    throw new Error(`ollama call failed: ${response.status}`);
  }

  const body = (await response.json()) as { response?: string };
  return body.response ?? '';
}

async function handlePrompt(raw: string): Promise<boolean> {
  const prompt = raw.trim();

  if (prompt === '' || prompt === 'exit' || prompt === '!done') {
    await dispatch('done');
    return false;
  }

  if (prompt.startsWith('!error ')) {
    errors += 1;
    await dispatch('error', { currentTask: prompt.slice(7) });
    return false;
  }

  if (prompt.startsWith('!wait ')) {
    await dispatch('waiting-input', { waitingReason: prompt.slice(6), currentTask: prompt.slice(6) });
    return true;
  }

  if (prompt.startsWith('!thinking ')) {
    await dispatch('thinking', { currentTask: prompt.slice(10) });
    return true;
  }

  if (prompt.startsWith('!running-tool ')) {
    toolCalls += 1;
    await dispatch('running-tool', { currentTask: prompt.slice(14) });
    return true;
  }

  if (prompt === '!tool') {
    toolCalls += 1;
    await dispatch('running-tool', { currentTask: 'calling ollama' });
    return true;
  }

  await dispatch('thinking', { currentTask: prompt });

  try {
    toolCalls += 1;
    await dispatch('running-tool', { currentTask: 'calling ollama' });
    const answer = await callOllama(prompt);
    tasks += 1;
    cost += COST_PER_CALL;
    await dispatch('done', { currentTask: answer || undefined });
  } catch {
    errors += 1;
    console.error('ollama call failed');
    await dispatch('error', { currentTask: 'ollama call failed' });
  }

  return true;
}

async function main(): Promise<void> {
  await dispatch('idle');

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  let running = true;
  while (running) {
    const line = await new Promise<string | null>((resolve) => {
      rl.once('line', resolve);
    });

    if (line === null) {
      await dispatch('done');
      break;
    }

    running = await handlePrompt(line);
  }

  rl.close();
}

try {
  await main();
} catch {
  console.error('agent fixture failed');
  process.exitCode = 1;
}
