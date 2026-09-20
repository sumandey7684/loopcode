import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { DynamicRouter } from '../src/router/dynamic.js';
import type { TaskNode } from '../src/ir/task.js';
import { Database } from 'bun:sqlite';
import * as fs from 'node:fs';

process.env.VITEST = '1';

describe('DynamicRouter', () => {
  const dbPath = 'test_performance.db';

  beforeAll(() => {
    // Setup test database schema
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS model_performance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model TEXT NOT NULL,
        task_type TEXT NOT NULL,
        task_complexity INTEGER NOT NULL,
        success BOOLEAN NOT NULL,
        cost REAL NOT NULL,
        duration_ms INTEGER NOT NULL,
        retry_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    db.close();
  });

  afterAll(() => {
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  const baseTask: TaskNode = {
    id: 'test-task',
    type: 'implement',
    description: 'Implement some code',
    goal: 'Test goal',
    systemPrompt: 'System guidelines',
    inputs: [],
    outputs: [],
    dependencies: [],
    readAllowlist: [],
    writeAllowlist: [],
    modelSpec: { tier: 'strong' },
    budget: { maxCostUsd: 5.0, maxDurationSeconds: 100, maxRetries: 3, maxTokens: 5000 },
    acceptanceCriteria: [],
    agentRole: 'engineer',
  };

  it('routes planning task to fable', () => {
    const router = new DynamicRouter();
    const task = { ...baseTask, type: 'plan' } as TaskNode;
    const selection = router.route(task);
    expect(selection.modelID).toBe('claude-fable-5');
    expect(selection.providerID).toBe('anthropic');
  });

  it('escalates to fable when complexity is high', () => {
    const router = new DynamicRouter();
    const task = {
      ...baseTask,
      inputs: new Array(6).fill({ type: 'file', source: 'a' }),
      dependencies: new Array(6).fill('dep'),
    } as TaskNode;
    const selection = router.route(task);
    expect(selection.modelID).toBe('claude-fable-5');
  });

  it('downgrades to flash when implementation is simple', () => {
    const router = new DynamicRouter();
    const task = { ...baseTask, inputs: [], dependencies: [] } as TaskNode;
    const selection = router.route(task);
    expect(selection.modelID).toBe('gemini-3.5-flash');
  });

  it('enforces budget by falling back to cheapest model', () => {
    const router = new DynamicRouter();
    const task = {
      ...baseTask,
      type: 'plan',
      budget: { maxCostUsd: 0.1, maxDurationSeconds: 100, maxRetries: 3, maxTokens: 1000 },
    } as TaskNode;
    const selection = router.route(task);
    expect(selection.modelID).toBe('deepseek-v4-flash');
    expect(selection.providerID).toBe('deepseek');
  });

  it('discounts cost when cache is warm for anthropic', () => {
    const router = new DynamicRouter();
    const task = { ...baseTask, type: 'plan' } as TaskNode;
    const selectionCold = router.route(task, 0.0);
    const selectionWarm = router.route(task, 0.8);
    expect(selectionWarm.estimatedCost).toBeLessThan(selectionCold.estimatedCost);
    expect(selectionWarm.estimatedCost).toBeCloseTo(selectionCold.estimatedCost * 0.2);
  });

  it('logs performance outcome to database', () => {
    const router = new DynamicRouter(dbPath);
    router.logOutcome('kimi-k2.6', 'implement', 2, true, 0.05, 1200, 0);

    const db = new Database(dbPath);
    const log = db.prepare('SELECT * FROM model_performance ORDER BY id DESC LIMIT 1').get() as any;
    db.close();

    expect(log).toBeDefined();
    expect(log.model).toBe('kimi-k2.6');
    expect(log.success).toBe(1);
    expect(log.cost).toBe(0.05);
    expect(log.duration_ms).toBe(1200);
  });
});
