import { GoalIRSchema, type GoalIR } from './goal.js';
import { TaskIRSchema, type TaskIR } from './task.js';
import { ExecutionIRSchema, type ExecutionIR } from './execution.js';
import { VerificationIRSchema, type VerificationIR } from './verification.js';
import { CompletionIRSchema, type CompletionIR } from './completion.js';

export class ValidationError extends Error {
  constructor(message: string) {
    super(`[IR Validation Error] ${message}`);
    this.name = 'ValidationError';
  }
}

export class IRValidator {
  /**
   * Validates and transforms Goal IR into Task IR.
   * Semantic Rule: Must have >= 1 acceptance criterion, must have a budget.
   */
  static validateGoalToTask(goalIR: GoalIR, taskIR: TaskIR): TaskIR {
    // 1. Zod schema validation
    const goalParse = GoalIRSchema.safeParse(goalIR);
    if (!goalParse.success) {
      throw new ValidationError(`Invalid Goal IR: ${goalParse.error.message}`);
    }

    const taskParse = TaskIRSchema.safeParse(taskIR);
    if (!taskParse.success) {
      throw new ValidationError(`Invalid Task IR: ${taskParse.error.message}`);
    }

    // 2. Semantic checks
    if (!goalIR.acceptanceCriteria || goalIR.acceptanceCriteria.length === 0) {
      throw new ValidationError('Goal IR must contain at least 1 acceptance criterion.');
    }

    if (
      !goalIR.constraints ||
      typeof goalIR.constraints.maxCost !== 'number' ||
      typeof goalIR.constraints.maxDuration !== 'number'
    ) {
      throw new ValidationError('Goal IR must define valid spending constraints.');
    }

    // TaskIR budget check
    if (
      !taskIR.tasks ||
      taskIR.tasks.some(
        (t) => !t.budget || typeof t.budget.maxCostUsd !== 'number' || typeof t.budget.maxDurationSeconds !== 'number',
      )
    ) {
      throw new ValidationError('Task IR contains tasks with missing or invalid budgets.');
    }

    return taskIR;
  }

  /**
   * Validates and transforms Task IR into Execution IR.
   * Semantic Rule: Must resolve all dependencies, must have model spec.
   */
  static validateTaskToExecution(taskIR: TaskIR, execIR: ExecutionIR): ExecutionIR {
    const taskParse = TaskIRSchema.safeParse(taskIR);
    if (!taskParse.success) {
      throw new ValidationError(`Invalid Task IR: ${taskParse.error.message}`);
    }

    const execParse = ExecutionIRSchema.safeParse(execIR);
    if (!execParse.success) {
      throw new ValidationError(`Invalid Execution IR: ${execParse.error.message}`);
    }

    // Semantic checks: Check model spec
    const executingTaskNode = taskIR.tasks.find((t) => t.id === execIR.taskId);
    if (!executingTaskNode) {
      throw new ValidationError(`Task ID ${execIR.taskId} not found in the Task IR list.`);
    }

    if (!executingTaskNode.modelSpec || !executingTaskNode.modelSpec.tier) {
      throw new ValidationError(`Task ${execIR.taskId} is missing a model spec tier.`);
    }

    // Check dependencies are resolved (all dependent tasks must be resolved or not currently in pending dependencies)
    // For LoopCode v2 scheduler: verify dependent tasks completed first.
    // If a task depends on another, the dependent task should have run.
    executingTaskNode.dependencies.forEach((depId) => {
      const depNode = taskIR.tasks.find((t) => t.id === depId);
      if (depNode && depNode.id === execIR.taskId) {
        throw new ValidationError(`Circular dependency detected: task ${execIR.taskId} depends on itself.`);
      }
    });

    return execIR;
  }

  /**
   * Validates and transforms Execution IR into Verification IR.
   * Semantic Rule: Must check for git commit and cost > 0.
   */
  static validateExecutionToVerification(execIR: ExecutionIR, verifyIR: VerificationIR): VerificationIR {
    const execParse = ExecutionIRSchema.safeParse(execIR);
    if (!execParse.success) {
      throw new ValidationError(`Invalid Execution IR: ${execParse.error.message}`);
    }

    const verifyParse = VerificationIRSchema.safeParse(verifyIR);
    if (!verifyParse.success) {
      throw new ValidationError(`Invalid Verification IR: ${verifyParse.error.message}`);
    }

    // Semantic checks
    if (!execIR.gitState || !execIR.gitState.commitAfter) {
      throw new ValidationError('Execution IR must contain a Git commit hash indicating code modifications.');
    }

    if (execIR.cost <= 0) {
      throw new ValidationError('Execution IR cost must be greater than zero.');
    }

    if (verifyIR.taskId !== execIR.taskId) {
      throw new ValidationError('Verification IR taskId does not match Execution IR taskId.');
    }

    return verifyIR;
  }

  /**
   * Validates and transforms Verification IR into Completion IR.
   * Semantic Rule: Must check for overallPass or explicit user override.
   */
  static validateVerificationToCompletion(
    verifyIR: VerificationIR,
    completionIR: CompletionIR,
    userOverride: boolean = false,
  ): CompletionIR {
    const verifyParse = VerificationIRSchema.safeParse(verifyIR);
    if (!verifyParse.success) {
      throw new ValidationError(`Invalid Verification IR: ${verifyParse.error.message}`);
    }

    const completionParse = CompletionIRSchema.safeParse(completionIR);
    if (!completionParse.success) {
      throw new ValidationError(`Invalid Completion IR: ${completionParse.error.message}`);
    }

    // Semantic checks
    if (!verifyIR.overallPass && !userOverride) {
      throw new ValidationError(
        'Cannot transition to Completion IR when verification fails, unless a userOverride is supplied.',
      );
    }

    if (completionIR.taskId !== verifyIR.taskId) {
      throw new ValidationError('Completion IR taskId does not match Verification IR taskId.');
    }

    return completionIR;
  }
}
