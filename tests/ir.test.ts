import { describe, it, expect } from 'bun:test';
import { IRValidator, ValidationError } from '../src/ir/validator.js';
import type { GoalIR } from '../src/ir/goal.js';
import type { TaskIR } from '../src/ir/task.js';
import type { ExecutionIR } from '../src/ir/execution.js';
import type { VerificationIR } from '../src/ir/verification.js';
import type { CompletionIR } from '../src/ir/completion.js';

process.env.VITEST = '1';

describe('IRValidator', () => {
  const validGoal: GoalIR = {
    id: 'goal-1',
    rawGoal: 'Test Goal',
    classification: {
      complexity: 'simple',
      estimatedFiles: 1,
      estimatedTasks: 1,
      requiresResearch: false,
      domain: 'backend',
    },
    acceptanceCriteria: [
      { id: 'ac-1', description: 'AC 1', verificationType: 'test', mustPass: true, autoVerify: true },
    ],
    constraints: {
      maxCost: 1.0,
      maxDuration: 60,
      allowedModels: [],
      forbiddenModels: [],
    },
    contextHints: {
      relevantFiles: [],
      relevantSymbols: [],
      techStack: [],
    },
  };

  const validTask: TaskIR = {
    id: 'task-list-1',
    goalId: 'goal-1',
    phase: 'planning',
    tasks: [
      {
        id: 'task-1',
        type: 'implement',
        description: 'First Task',
        goal: 'Test goal',
        systemPrompt: 'System guidelines',
        inputs: [],
        outputs: [],
        dependencies: [],
        readAllowlist: [],
        writeAllowlist: [],
        modelSpec: { tier: 'frontier' },
        budget: { maxCostUsd: 0.5, maxDurationSeconds: 30, maxRetries: 3, maxTokens: 1000 },
        acceptanceCriteria: ['AC 1'],
        agentRole: 'engineer',
      },
    ],
    edges: [],
    metadata: {
      totalEstimatedCost: 0.5,
      totalEstimatedDuration: 30,
      parallelizable: false,
      retryPolicy: { maxTotalRetries: 5, backoffFactor: 2 },
    },
  };

  it('validates Goal IR to Task IR successfully', () => {
    const result = IRValidator.validateGoalToTask(validGoal, validTask);
    expect(result.id).toBe('task-list-1');
  });

  it('throws ValidationError when Goal IR has no acceptance criteria', () => {
    const invalidGoal = { ...validGoal, acceptanceCriteria: [] };
    expect(() => IRValidator.validateGoalToTask(invalidGoal, validTask)).toThrow(ValidationError);
  });

  it('validates Task IR to Execution IR successfully', () => {
    const validExec: ExecutionIR = {
      taskId: 'task-1',
      sessionId: 'session-123',
      modelUsed: 'claude-5-sonnet',
      cost: 0.05,
      durationMs: 500,
      steps: [],
      gitState: {
        branch: 'main',
        commitBefore: 'abc',
        commitAfter: 'def',
      },
    };

    const result = IRValidator.validateTaskToExecution(validTask, validExec);
    expect(result.sessionId).toBe('session-123');
  });

  it('validates Execution IR to Verification IR successfully', () => {
    const validExec: ExecutionIR = {
      taskId: 'task-1',
      sessionId: 'session-123',
      modelUsed: 'claude-5-sonnet',
      cost: 0.05,
      durationMs: 500,
      steps: [],
      gitState: {
        branch: 'main',
        commitBefore: 'abc',
        commitAfter: 'def',
      },
    };

    const validVerify: VerificationIR = {
      taskId: 'task-1',
      layers: [
        { name: 'compile', type: 'compile', passed: true, evidence: 'ok', durationMs: 10, cost: 0, confidence: 1 },
      ],
      overallPass: true,
      canRetry: true,
      regressions: [],
    };

    const result = IRValidator.validateExecutionToVerification(validExec, validVerify);
    expect(result.taskId).toBe('task-1');
  });

  it('throws when Execution IR has cost <= 0', () => {
    const invalidExec: ExecutionIR = {
      taskId: 'task-1',
      sessionId: 'session-123',
      modelUsed: 'claude-5-sonnet',
      cost: 0.0,
      durationMs: 500,
      steps: [],
      gitState: {
        branch: 'main',
        commitBefore: 'abc',
        commitAfter: 'def',
      },
    };

    const validVerify: VerificationIR = {
      taskId: 'task-1',
      layers: [],
      overallPass: true,
      canRetry: false,
      regressions: [],
    };

    expect(() => IRValidator.validateExecutionToVerification(invalidExec, validVerify)).toThrow(ValidationError);
  });

  it('validates Verification IR to Completion IR successfully', () => {
    const validVerify: VerificationIR = {
      taskId: 'task-1',
      layers: [],
      overallPass: true,
      canRetry: true,
      regressions: [],
    };

    const validCompletion: CompletionIR = {
      goalId: 'goal-1',
      taskId: 'task-1',
      status: 'success',
      summary: 'all done',
      filesChanged: [],
      totalCost: 0.05,
      totalDurationMs: 500,
      verificationReport: validVerify,
      gitCommit: 'def',
      lessonsLearned: [],
    };

    const result = IRValidator.validateVerificationToCompletion(validVerify, validCompletion);
    expect(result.status).toBe('success');
  });
});
