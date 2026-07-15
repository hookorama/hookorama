import { describe, expect, it } from 'vitest';
import { buildCommonHookRequest } from './hook-args.js';

describe('buildCommonHookRequest', () => {
  it('parses status and cwd', () => {
    const request = buildCommonHookRequest('claude', 'thinking', ['--cwd', '/tmp/project']);
    expect(request.status).toBe('thinking');
    expect(request.agent).toBe('claude');
    expect(request.cwd).toBe('/tmp/project');
  });

  it('throws for invalid status', () => {
    expect(() => buildCommonHookRequest('claude', 'nope', [])).toThrow('invalid status');
  });

  it('parses metadata flags', () => {
    const request = buildCommonHookRequest('devin', 'running-tool', [
      '--model',
      'gpt-4',
      '--task',
      'refactor',
      '--metrics-tasks',
      '3',
      '--metrics-cost',
      '0.004',
    ]);
    expect(request.metadata?.model).toBe('gpt-4');
    expect(request.metadata?.currentTask).toBe('refactor');
    expect(request.metadata?.metrics).toEqual({
      tasks: 3,
      toolCalls: 0,
      cost: 0.004,
      errors: 0,
    });
  });
});
