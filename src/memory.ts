import { Database } from 'bun:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SCHEMA_SQL } from './db/schema.js';
import { redact } from './app/redact.js';
import type { VerificationReport } from './types.js';

export interface TaskRecord {
  id: string;
  goal: string;
  state: 'planning' | 'executing' | 'verifying' | 'done' | 'failed';
  plan_json?: string;
  current_task_index: number;
  total_cost: number;
  created_at?: string;
  updated_at?: string;
}

export interface SessionRecord {
  id: string;
  name: string | null;
  goal_id: string;
  status: 'active' | 'paused' | 'archived';
  created_at: string;
  updated_at: string;
  last_activity: string;
  message_count: number;
  total_cost: number;
  context_usage: number;
  git_branch: string | null;
  parent_session_id: string | null;
  metadata: string | null;
}

export class Memory {
  private db: Database;

  constructor(dbPath: string = 'loopcode.db') {
    const dbDir = path.dirname(dbPath);
    if (dbDir !== '.' && !fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.initializeSchema();
  }

  private initializeSchema() {
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec(SCHEMA_SQL);
  }

  createTask(id: string, goal: string, state: 'planning' | 'executing' | 'verifying' | 'done' | 'failed' = 'planning') {
    const stmt = this.db.prepare(`
      INSERT INTO tasks (id, goal, state)
      VALUES (?, ?, ?)
    `);
    stmt.run(id, goal, state);
  }

  updateTaskState(id: string, state: 'planning' | 'executing' | 'verifying' | 'done' | 'failed') {
    const stmt = this.db.prepare(`
      UPDATE tasks 
      SET state = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(state, id);
  }

  updateTaskPlan(id: string, planJson: string | any[]) {
    const jsonStr = typeof planJson === 'string' ? planJson : JSON.stringify(planJson);
    const stmt = this.db.prepare(`
      UPDATE tasks 
      SET plan_json = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(jsonStr, id);
  }

  updateTaskProgress(id: string, currentIndex: number) {
    const stmt = this.db.prepare(`
      UPDATE tasks 
      SET current_task_index = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(currentIndex, id);
  }

  getTask(id: string): TaskRecord | undefined {
    const stmt = this.db.prepare('SELECT * FROM tasks WHERE id = ?');
    return stmt.get(id) as TaskRecord | undefined;
  }

  logStateTransition(taskId: string, phase: string, stateJson: string) {
    const stmt = this.db.prepare(`
      INSERT INTO state_log (task_id, phase, state_json)
      VALUES (?, ?, ?)
    `);
    stmt.run(taskId, phase, stateJson);
  }

  getStateLogs(taskId: string) {
    const stmt = this.db.prepare('SELECT * FROM state_log WHERE task_id = ? ORDER BY id ASC');
    return stmt.all(taskId);
  }

  saveTaskResult(
    taskId: string,
    stepIndex: number,
    verification: VerificationReport,
    cost: number,
    durationMs: number,
  ) {
    const stmt = this.db.prepare(`
      INSERT INTO task_results (task_id, step_index, verification_json, cost, duration_ms)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(taskId, stepIndex, redact(JSON.stringify(verification)), cost, durationMs);

    const task = this.getTask(taskId);
    if (task) {
      const newCost = task.total_cost + cost;
      const updateStmt = this.db.prepare('UPDATE tasks SET total_cost = ? WHERE id = ?');
      updateStmt.run(newCost, taskId);
    }
  }

  getTaskResults(taskId: string) {
    const stmt = this.db.prepare('SELECT * FROM task_results WHERE task_id = ? ORDER BY step_index ASC');
    return stmt.all(taskId);
  }

  // --- Session Methods ---

  createSession(
    id: string,
    name: string | null,
    goalId: string,
    parentSessionId: string | null = null,
    metadata: string | null = null,
    gitBranch: string | null = null,
  ) {
    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, name, goal_id, status, parent_session_id, metadata, git_branch)
      VALUES (?, ?, ?, 'active', ?, ?, ?)
    `);
    stmt.run(id, name, goalId, parentSessionId, metadata, gitBranch);
  }

  updateSessionStatus(id: string, status: 'active' | 'paused' | 'archived') {
    const stmt = this.db.prepare(`
      UPDATE sessions
      SET status = ?, updated_at = CURRENT_TIMESTAMP, last_activity = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(status, id);
  }

  updateSessionActivity(id: string, messageCount: number, totalCost: number, contextUsage: number) {
    const stmt = this.db.prepare(`
      UPDATE sessions
      SET message_count = ?, total_cost = ?, context_usage = ?, updated_at = CURRENT_TIMESTAMP, last_activity = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(messageCount, totalCost, contextUsage, id);
  }

  renameSession(id: string, name: string) {
    const stmt = this.db.prepare(`
      UPDATE sessions
      SET name = ?, updated_at = CURRENT_TIMESTAMP, last_activity = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(name, id);
  }

  deleteSession(id: string) {
    const stmt = this.db.prepare('DELETE FROM sessions WHERE id = ?');
    stmt.run(id);
  }

  getSession(id: string): SessionRecord | undefined {
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE id = ?');
    return stmt.get(id) as SessionRecord | undefined;
  }

  getSessionByGoal(goalId: string): SessionRecord | undefined {
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE goal_id = ?');
    return stmt.get(goalId) as SessionRecord | undefined;
  }

  attachGoalToSession(sessionId: string, goalId: string): void {
    const stmt = this.db.prepare(`
      UPDATE sessions
      SET goal_id = ?, updated_at = CURRENT_TIMESTAMP, last_activity = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(goalId, sessionId);
  }

  getSessions(): SessionRecord[] {
    const stmt = this.db.prepare('SELECT * FROM sessions ORDER BY last_activity DESC');
    return stmt.all() as SessionRecord[];
  }

  close() {
    this.db.close();
  }
}
