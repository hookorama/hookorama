import { describe, expect, it } from 'vitest';
import { getPlugin, listPlugins } from './plugin-registry.js';

describe('plugin-registry', () => {
  it('lists built-in plugins', () => {
    const plugins = listPlugins();
    expect(plugins.map((p) => p.name)).toEqual(['claude', 'devin']);
  });

  it('throws for unknown plugins', () => {
    expect(() => getPlugin('unknown')).toThrow('unknown agent plugin');
  });

  it('returns claude and devin plugins', () => {
    expect(getPlugin('claude').name).toBe('claude');
    expect(getPlugin('devin').name).toBe('devin');
  });
});
