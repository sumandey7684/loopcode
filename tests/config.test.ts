import { describe, it, expect } from 'bun:test';
import { migrateConfig } from '../src/config/schema.js';
import { ConfigManager } from '../src/config.js';

describe('config migration', () => {
  it('maps legacy [budgets] onto [budget]', () => {
    const { config, notices } = migrateConfig({ budgets: { monthly: 5, goal: 2, task: 0.5 } });
    expect(config.budget.maxMonthlyCostUsd).toBe(5);
    expect(config.budget.maxGoalCostUsd).toBe(2);
    expect(config.budget.maxTaskCostUsd).toBe(0.5);
    expect(notices.some((n) => n.includes('[budgets] is deprecated'))).toBe(true);
  });

  it('maps deprecated maxSessionCostUsd to maxGoalCostUsd', () => {
    const { config } = migrateConfig({ budget: { maxSessionCostUsd: 7 } });
    expect(config.budget.maxGoalCostUsd).toBe(7);
  });

  it('falls back to defaults on invalid input', () => {
    const { config, notices } = migrateConfig({ budget: { maxMonthlyCostUsd: -3 } });
    expect(config.budget.maxMonthlyCostUsd).toBe(100);
    expect(notices.length).toBeGreaterThan(0);
  });

  it('proxy is disabled by default', () => {
    const { config } = migrateConfig({});
    expect(config.proxy.enabled).toBe(false);
    expect(config.proxy.riskAcceptedAt).toBe('');
  });
});

describe('resolveModelRoute', () => {
  it('splits on the first slash so openrouter ids work', () => {
    expect(ConfigManager.resolveModelRoute('openrouter/anthropic/claude-3.5-sonnet')).toEqual({
      providerID: 'openrouter',
      modelID: 'anthropic/claude-3.5-sonnet',
    });
  });

  it('rejects malformed values', () => {
    expect(ConfigManager.resolveModelRoute('nope')).toBeUndefined();
    expect(ConfigManager.resolveModelRoute('trailing/')).toBeUndefined();
  });
});
