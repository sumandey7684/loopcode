import type { TaskNode, Budget } from '../ir/task.js';
import type { Catalog } from '../auth/provider-catalog.js';
import { Database } from 'bun:sqlite';

export interface ModelSelection {
  modelID: string;
  providerID: string;
  estimatedCost: number;
  estimatedLatency: number;
  fallback?: string;
  cacheWarmth: number;
}

export class DynamicRouter {
  private db?: Database;
  private catalog: Catalog | null = null;

  constructor(dbPath?: string) {
    if (dbPath) {
      try {
        this.db = new Database(dbPath);
      } catch (err) {
        console.warn(`[DynamicRouter] Database connection failed: ${err}`);
      }
    }
  }

  setCatalog(catalog: Catalog): void {
    this.catalog = catalog;
  }

  /**
   * Routes a task using the 4-tiered cascade router.
   */
  route(task: TaskNode, cacheWarmth: number = 0.0): ModelSelection {
    // TIER 1: Task Type Rules
    let selection = this.routeByTaskType(task, cacheWarmth);

    // TIER 2: Complexity Adjustments
    selection = this.adjustByComplexity(selection, task);

    // TIER 3: Budget Enforcement
    selection = this.enforceBudget(selection, task.budget);

    // TIER 4: Cache Awareness
    selection = this.adjustByCache(selection);

    return selection;
  }

  /**
   * Tier 1: Initial routing based on task type.
   */
  private routeByTaskType(task: TaskNode, cacheWarmth: number): ModelSelection {
    // If catalog is available, prefer models present in the user's catalog
    if (this.catalog && this.catalog.providers.length > 0) {
      const allModels = this.catalog.providers.flatMap((p) => p.models.map((m) => ({ providerID: p.id, model: m })));
      if (allModels.length > 0) {
        if (task.type === 'plan') {
          const reasoning = allModels.find((m) => m.model.supportsReasoning);
          if (reasoning) {
            return {
              modelID: reasoning.model.id,
              providerID: reasoning.providerID,
              estimatedCost: 1.0,
              estimatedLatency: 10000,
              cacheWarmth,
            };
          }
        }
        const cheapest = [...allModels].sort(
          (a, b) => (a.model.inputCostPerMillion ?? 0) - (b.model.inputCostPerMillion ?? 0),
        )[0];
        if (cheapest) {
          return {
            modelID: cheapest.model.id,
            providerID: cheapest.providerID,
            estimatedCost: 0.1,
            estimatedLatency: 3000,
            cacheWarmth,
          };
        }
      }
    }

    switch (task.type) {
      case 'plan':
        return {
          modelID: 'claude-fable-5',
          providerID: 'anthropic',
          estimatedCost: 2.5,
          estimatedLatency: 15000,
          fallback: 'claude-4.8-opus',
          cacheWarmth,
        };
      case 'research':
        return {
          modelID: 'gemini-3.1-pro',
          providerID: 'google',
          estimatedCost: 0.8,
          estimatedLatency: 8000,
          fallback: 'claude-4.8-opus',
          cacheWarmth,
        };
      case 'implement':
        if (task.budget.maxCostUsd < 0.5) {
          return {
            modelID: 'deepseek-v4-pro',
            providerID: 'deepseek',
            estimatedCost: 0.15,
            estimatedLatency: 5000,
            fallback: 'claude-5-sonnet',
            cacheWarmth,
          };
        }
        return {
          modelID: 'kimi-k2.6',
          providerID: 'moonshot',
          estimatedCost: 0.3,
          estimatedLatency: 6000,
          fallback: 'claude-5-sonnet',
          cacheWarmth,
        };
      case 'review':
        return {
          modelID: 'claude-4.8-opus',
          providerID: 'anthropic',
          estimatedCost: 1.0,
          estimatedLatency: 10000,
          fallback: 'claude-fable-5',
          cacheWarmth,
        };
      case 'verify':
        return {
          modelID: 'gemini-3.5-flash',
          providerID: 'google',
          estimatedCost: 0.1,
          estimatedLatency: 2000,
          fallback: 'deepseek-v4-flash',
          cacheWarmth,
        };
      default:
        return {
          modelID: 'claude-5-sonnet',
          providerID: 'anthropic',
          estimatedCost: 0.5,
          estimatedLatency: 4000,
          cacheWarmth,
        };
    }
  }

  /**
   * Tier 2: Escalates or downgrades based on complexity parameters.
   */
  private adjustByComplexity(selection: ModelSelection, task: TaskNode): ModelSelection {
    const complexity = (task.inputs?.length ?? 0) + (task.dependencies?.length ?? 0);

    if (complexity > 10 && selection.modelID !== 'claude-fable-5') {
      return {
        ...selection,
        modelID: 'claude-fable-5',
        providerID: 'anthropic',
        estimatedCost: selection.estimatedCost * 3.0,
      };
    }

    if (complexity < 3 && task.type === 'implement') {
      return {
        ...selection,
        modelID: 'gemini-3.5-flash',
        providerID: 'google',
        estimatedCost: 0.05,
      };
    }

    return selection;
  }

  /**
   * Tier 3: Budget enforcement - downgrades to cheapest model if cost exceeds budget limit.
   */
  private enforceBudget(selection: ModelSelection, budget: Budget): ModelSelection {
    if (selection.estimatedCost > budget.maxCostUsd) {
      return {
        modelID: 'deepseek-v4-flash',
        providerID: 'deepseek',
        estimatedCost: 0.05,
        estimatedLatency: 3000,
        cacheWarmth: selection.cacheWarmth,
      };
    }
    return selection;
  }

  /**
   * Tier 4: Cache Awareness (Anthropic provides 90% discount on cached inputs).
   */
  private adjustByCache(selection: ModelSelection): ModelSelection {
    if (selection.cacheWarmth > 0.7 && selection.providerID === 'anthropic') {
      return {
        ...selection,
        estimatedCost: selection.estimatedCost * 0.2,
      };
    }
    return selection;
  }

  /**
   * Log performance metrics to model_performance table.
   */
  logOutcome(
    model: string,
    taskType: string,
    complexity: number,
    success: boolean,
    cost: number,
    durationMs: number,
    retryCount: number = 0,
  ) {
    if (!this.db) return;
    try {
      const stmt = this.db.prepare(`
        INSERT INTO model_performance (model, task_type, task_complexity, success, cost, duration_ms, retry_count)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(model, taskType, complexity, success ? 1 : 0, cost, durationMs, retryCount);
    } catch (err) {
      console.warn(`[DynamicRouter] Failed to log outcome to database: ${err}`);
    }
  }

  close() {
    this.db?.close();
  }
}
