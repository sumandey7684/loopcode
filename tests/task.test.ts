import { describe, it, expect } from 'bun:test';
import { validatePlan } from '../src/task.js';
import type { Task } from '../src/types.js';

process.env.VITEST = '1';

describe('validatePlan', () => {
  it('allows sequential tasks modifying the same file but raises warning', () => {
    const tasks: Task[] = [
      {
        id: '1',
        description: 'Task 1',
        goal: 'Add config parameter A',
        category: 'feature',
        systemPrompt: '',
        expectedOutputs: ['src/config.json'],
        writeAllowlist: ['src/config.json'],
        verification: [],
        maxCost: 1.0,
        timeout: 100,
      },
      {
        id: '2',
        description: 'Task 2',
        goal: 'Add config parameter B',
        category: 'feature',
        systemPrompt: '',
        expectedOutputs: ['src/config.json'],
        writeAllowlist: ['src/config.json'],
        verification: [],
        maxCost: 1.0,
        timeout: 100,
      },
    ];

    const result = validatePlan(tasks);
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain('modified sequentially by multiple tasks');
  });

  it('rejects a task with an empty goal', () => {
    const tasks: Task[] = [
      {
        id: '1',
        description: 'Task 1',
        goal: '',
        category: 'feature',
        systemPrompt: '',
        expectedOutputs: [],
        writeAllowlist: [],
        verification: [],
        maxCost: 1.0,
        timeout: 100,
      },
    ];

    const result = validatePlan(tasks);
    expect(result.valid).toBe(false);
  });
});
