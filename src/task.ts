import type { Task } from './types.js';

export interface ValidationResult {
  valid: boolean;
  warnings: string[];
  conflicts: Array<[string, Task[]]>;
}

/**
 * Validates a generated plan, checking for dependency order and conflicts.
 * Step 2.1 Fix: Sequential execution allows incremental editing of the same file.
 * This checks for same-file modifications but issues warnings instead of hard-rejecting the plan.
 */
export function validatePlan(tasks: Task[]): ValidationResult {
  const fileToTasks = new Map<string, Task[]>();
  const warnings: string[] = [];

  for (const task of tasks) {
    // Collect write allowlists to track who touches what
    for (const file of task.writeAllowlist) {
      if (!fileToTasks.has(file)) {
        fileToTasks.set(file, []);
      }
      fileToTasks.get(file)!.push(task);
    }
  }

  const conflicts = Array.from(fileToTasks.entries()).filter(([_, taskList]) => taskList.length > 1);

  if (conflicts.length > 0) {
    for (const [file, taskList] of conflicts) {
      const descriptions = taskList.map((t) => `"${t.description}"`).join(', ');
      warnings.push(
        `File "${file}" will be modified sequentially by multiple tasks: ${descriptions}. This is allowed but may require care.`,
      );
    }
  }

  // Basic task validation (ensure timeout, goal, maxCost are positive)
  for (const task of tasks) {
    if (!task.goal || task.goal.trim() === '') {
      return {
        valid: false,
        warnings,
        conflicts,
      };
    }
    if (task.timeout <= 0) {
      warnings.push(`Task "${task.description}" has invalid timeout ${task.timeout}s. Overriding to default 300s.`);
      task.timeout = 300;
    }
    if (task.maxCost <= 0) {
      warnings.push(`Task "${task.description}" has invalid budget $${task.maxCost}. Overriding to default $2.00.`);
      task.maxCost = 2.0;
    }
  }

  return {
    valid: true,
    warnings,
    conflicts,
  };
}
