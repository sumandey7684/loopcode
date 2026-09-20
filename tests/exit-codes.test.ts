import { describe, it, expect } from 'bun:test';
import * as fs from 'node:fs';
import { BudgetExceededError, CostEngine } from '../src/cost/engine.js';
import { safeBranchName } from '../src/scheduler/worktree.js';

describe('Exit codes and safety checks', () => {
  it('BudgetExceededError has exitCode 77 and BUDGET_TERMINATION message', () => {
    const err = new BudgetExceededError('Goal limit exceeded');
    expect(err.exitCode).toBe(77);
    expect(err.message).toContain('BUDGET_TERMINATION: Goal limit exceeded');
  });

  it('CostEngine.terminateDueToBudget throws BudgetExceededError', () => {
    const testDb = 'test_budget_exit.db';
    if (fs.existsSync(testDb)) fs.unlinkSync(testDb);
    const engine = new CostEngine(testDb);
    try {
      expect(() => engine.terminateDueToBudget('Task cost exceeded')).toThrow(BudgetExceededError);
    } finally {
      engine.close();
      if (fs.existsSync(testDb)) fs.unlinkSync(testDb);
    }
  });

  it('safeBranchName throws on unsafe branch characters (AC-5.6)', () => {
    expect(() => safeBranchName('a; rm -rf /')).toThrow();
    expect(() => safeBranchName('../../../etc/passwd')).toThrow();
    expect(safeBranchName('task-123')).toBe('loopcode/task-task-123');
  });
});
