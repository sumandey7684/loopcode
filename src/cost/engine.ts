import { Database } from 'bun:sqlite';
import * as fs from 'node:fs';
import { parse } from 'smol-toml';

export interface BudgetLimit {
  maxCostUsd: number;
  maxDurationSeconds: number;
  maxTokens: number;
}

export class BudgetExceededError extends Error {
  readonly exitCode = 77;
  constructor(message: string) {
    super(`BUDGET_TERMINATION: ${message}`);
    this.name = 'BudgetExceededError';
  }
}

export class CostEngine {
  private dbPath: string;
  private db: Database;
  private goalBudget = 10.0;
  private taskBudget = 2.0;
  private monthlyBudget = 100.0;
  /** Providers whose usage is quota-based rather than metered. */
  private quotaProviders = new Set<string>();

  constructor(dbPath: string = 'loopcode.db') {
    this.dbPath = dbPath;
    this.db = new Database(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.loadConfig();
    this.initializeTable();
  }

  setQuotaProviders(ids: string[]): void {
    this.quotaProviders = new Set(ids);
  }

  isQuotaProvider(providerId: string): boolean {
    return this.quotaProviders.has(providerId);
  }

  private loadConfig() {
    try {
      if (fs.existsSync('config.toml')) {
        const tomlStr = fs.readFileSync('config.toml', 'utf8');
        const config = parse(tomlStr) as any;
        if (config.budgets) {
          this.monthlyBudget = config.budgets.monthly || this.monthlyBudget;
          this.goalBudget = config.budgets.goal || this.goalBudget;
          this.taskBudget = config.budgets.task || this.taskBudget;
        }
      }
    } catch {
      // Ignore config load failures
    }
  }

  private initializeTable() {
    this.db
      .prepare(
        `
        CREATE TABLE IF NOT EXISTS cost_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          goal_id TEXT NOT NULL,
          task_id TEXT,
          model TEXT,
          tokens_spent INTEGER,
          cost_spent REAL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `,
      )
      .run();
  }

  async getGoalSpent(goalId: string): Promise<number> {
    const row = this.db.prepare('SELECT SUM(cost_spent) as spent FROM cost_log WHERE goal_id = ?').get(goalId) as any;
    return row?.spent || 0.0;
  }

  async canSpend(goalId: string, estimatedCost: number, goalLimit: number): Promise<boolean> {
    const spent = await this.getGoalSpent(goalId);
    if (spent + estimatedCost > goalLimit) {
      return false;
    }
    return true;
  }

  async recordSpend(goalId: string, taskId: string, model: string, tokens: number, cost: number): Promise<void> {
    this.db
      .prepare(
        `
        INSERT INTO cost_log (goal_id, task_id, model, tokens_spent, cost_spent)
        VALUES (?, ?, ?, ?, ?)
      `,
      )
      .run(goalId, taskId, model, tokens, cost);
  }

  async getMonthlySpent(): Promise<number> {
    const row = this.db
      .prepare("SELECT SUM(cost_spent) as spent FROM cost_log WHERE created_at >= datetime('now', '-30 days')")
      .get() as any;
    return row?.spent || 0.0;
  }

  async getTaskSpent(taskId: string): Promise<number> {
    const row = this.db.prepare('SELECT SUM(cost_spent) as spent FROM cost_log WHERE task_id = ?').get(taskId) as any;
    return row?.spent || 0.0;
  }

  /**
   * Throw BudgetExceededError on budget termination.
   */
  terminateDueToBudget(message: string): never {
    throw new BudgetExceededError(message);
  }

  close(): void {
    this.db.close();
  }
}
