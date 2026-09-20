import { Database } from 'bun:sqlite';
import { SemanticMemory } from './semantic.js';
import { redact } from '../app/redact.js';

export interface PerformanceLog {
  model: string;
  taskType: string;
  complexity: string;
  success: boolean;
  cost: number;
  durationMs: number;
}

export class MemoryEngine {
  private dbPath: string;
  db: Database;

  constructor(dbPath: string = 'loopcode.db') {
    this.dbPath = dbPath;
    this.db = new Database(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.initializeTables();
  }

  private initializeTables() {
    this.db
      .prepare(
        `
        CREATE TABLE IF NOT EXISTS working_memory (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          task_id TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT NOT NULL,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `,
      )
      .run();

    this.db
      .prepare(
        `
        CREATE TABLE IF NOT EXISTS project_memory (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          category TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT NOT NULL,
          source_task_id TEXT,
          confidence REAL DEFAULT 1.0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `,
      )
      .run();

    this.db
      .prepare(
        `
        CREATE TABLE IF NOT EXISTS task_plans (
          task_id TEXT PRIMARY KEY,
          goal_id TEXT NOT NULL,
          plan_json TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `,
      )
      .run();

    this.db
      .prepare(
        `
        CREATE TABLE IF NOT EXISTS task_executions (
          task_id TEXT PRIMARY KEY,
          execution_json TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `,
      )
      .run();

    this.db
      .prepare(
        `
        CREATE TABLE IF NOT EXISTS task_reviews (
          task_id TEXT PRIMARY KEY,
          review_json TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `,
      )
      .run();

    this.db
      .prepare(
        `
        CREATE TABLE IF NOT EXISTS code_graph_nodes (
          id TEXT PRIMARY KEY,
          file_path TEXT NOT NULL,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          line_start INTEGER,
          line_end INTEGER,
          signature TEXT,
          docstring TEXT,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `,
      )
      .run();

    this.db
      .prepare(
        `
        CREATE TABLE IF NOT EXISTS code_graph_edges (
          source_id TEXT,
          target_id TEXT,
          relationship TEXT,
          PRIMARY KEY (source_id, target_id, relationship)
        )
      `,
      )
      .run();

    this.db
      .prepare(
        `
        CREATE VIRTUAL TABLE IF NOT EXISTS code_search USING fts5(
          id UNINDEXED,
          file_path,
          name,
          signature,
          docstring
        )
      `,
      )
      .run();
  }

  // --- Code Graph Memory ---

  saveCodeGraphNodes(nodes: any[]) {
    const insertNode = this.db.prepare(`
      INSERT INTO code_graph_nodes (id, file_path, name, type, line_start, line_end, signature, docstring)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        file_path = excluded.file_path,
        name = excluded.name,
        type = excluded.type,
        line_start = excluded.line_start,
        line_end = excluded.line_end,
        signature = excluded.signature,
        docstring = excluded.docstring,
        updated_at = CURRENT_TIMESTAMP
    `);

    const insertFTS = this.db.prepare(`
      INSERT INTO code_search (id, file_path, name, signature, docstring)
      VALUES (?, ?, ?, ?, ?)
    `);

    const deleteFTS = this.db.prepare(`DELETE FROM code_search WHERE id = ?`);

    const insertEdge = this.db.prepare(`
      INSERT OR IGNORE INTO code_graph_edges (source_id, target_id, relationship)
      VALUES (?, ?, ?)
    `);

    this.db.transaction(() => {
      for (const node of nodes) {
        insertNode.run(
          node.id,
          node.path,
          node.name,
          node.type,
          node.lineStart,
          node.lineEnd,
          node.signature,
          node.docstring || null,
        );

        deleteFTS.run(node.id);
        insertFTS.run(node.id, node.path, node.name, node.signature, node.docstring || '');

        if (node.children && Array.isArray(node.children)) {
          for (const childId of node.children) {
            insertEdge.run(node.id, childId, 'contains');
          }
        }
      }
    })();
  }

  deleteCodeGraphForFile(filePath: string) {
    this.db
      .prepare(
        `
      DELETE FROM code_graph_edges 
      WHERE source_id IN (SELECT id FROM code_graph_nodes WHERE file_path = ?)
         OR target_id IN (SELECT id FROM code_graph_nodes WHERE file_path = ?)
    `,
      )
      .run(filePath, filePath);

    this.db.prepare(`DELETE FROM code_search WHERE file_path = ?`).run(filePath);
    this.db.prepare(`DELETE FROM code_graph_nodes WHERE file_path = ?`).run(filePath);
  }

  getSymbolsForFile(filePath: string): any[] {
    try {
      const rows = this.db
        .prepare(
          `
        SELECT id, file_path as path, name, type, line_start as lineStart, line_end as lineEnd, signature
        FROM code_graph_nodes WHERE file_path = ?
      `,
        )
        .all(filePath);
      return rows;
    } catch {
      return [];
    }
  }

  async searchCodebase(query: string, limit: number = 10): Promise<any[]> {
    const results: any[] = [];

    // 1. FTS5 Search
    try {
      const ftsQuery = query.replace(/["']/g, '');
      const ftsRows = this.db
        .prepare(
          `
        SELECT id, file_path, name, signature, docstring, rank as score
        FROM code_search
        WHERE code_search MATCH ?
        ORDER BY rank
        LIMIT ?
      `,
        )
        .all(`"${ftsQuery}"*`, limit);
      for (const row of ftsRows) {
        results.push({ ...(row as any), source: 'fts' });
      }
    } catch {
      // ignore empty/syntax errors
    }

    // 2. Vector Search
    try {
      const semanticMemory = new SemanticMemory(this.dbPath);
      const vecResults = await semanticMemory.search(query, limit);
      for (const res of vecResults) {
        results.push({ ...res, source: 'semantic' });
      }
    } catch {
      // ignore missing semantic memory
    }

    return results;
  }

  /**
   * Log model routing performance for future routing heuristics.
   */
  logPerformance(log: PerformanceLog) {
    try {
      this.db
        .prepare(
          `
        INSERT INTO model_performance (model, task_type, task_complexity, success, cost, duration_ms)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
        )
        .run(
          log.model,
          log.taskType,
          log.complexity === 'complex' ? 5 : 1,
          log.success ? 1 : 0,
          log.cost,
          log.durationMs,
        );
    } catch {
      // fallback
    }
  }

  /**
   * Store prompt/response cache entries.
   */
  storeCache(promptHash: string, response: string, cost: number) {
    try {
      this.db
        .prepare(
          `
        INSERT INTO cache_entries (id, query_embedding, response, model, cost)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET cost = cost + excluded.cost
      `,
        )
        .run(promptHash, Buffer.alloc(0), response, 'unknown', cost);
    } catch {
      // ignore
    }
  }

  /**
   * Get cache entries by prompt hash.
   */
  getCache(promptHash: string): string | null {
    try {
      const row = this.db.prepare('SELECT response FROM cache_entries WHERE id = ?').get(promptHash) as any;
      return row?.response || null;
    } catch {
      return null;
    }
  }

  /**
   * Store lessons learned and project conventions.
   */
  addProjectLesson(conventions: string, lessons: string) {
    if (conventions) {
      this.db
        .prepare("INSERT INTO project_memory (category, key, value) VALUES ('convention', 'general', ?)")
        .run(conventions);
    }
    if (lessons) {
      this.db.prepare("INSERT INTO project_memory (category, key, value) VALUES ('lesson', 'general', ?)").run(lessons);
    }
  }

  /**
   * Query conventions from past projects.
   */
  getConventions(): string[] {
    const rows = this.db
      .prepare("SELECT value FROM project_memory WHERE category = 'convention' ORDER BY id DESC LIMIT 5")
      .all() as any[];
    return rows.map((r) => r.value).filter(Boolean);
  }

  // --- Shared Memory Agent Communication ---

  saveTaskPlan(taskId: string, goalId: string, planJson: string) {
    this.db
      .prepare(
        `
      INSERT INTO task_plans (task_id, goal_id, plan_json)
      VALUES (?, ?, ?)
      ON CONFLICT(task_id) DO UPDATE SET plan_json = excluded.plan_json
    `,
      )
      .run(taskId, goalId, planJson);
  }

  getTaskPlan(taskId: string): string | null {
    try {
      const row = this.db.prepare('SELECT plan_json FROM task_plans WHERE task_id = ?').get(taskId) as any;
      return row?.plan_json || null;
    } catch {
      return null;
    }
  }

  saveTaskExecution(taskId: string, executionJson: string) {
    this.db
      .prepare(
        `
      INSERT INTO task_executions (task_id, execution_json)
      VALUES (?, ?)
      ON CONFLICT(task_id) DO UPDATE SET execution_json = excluded.execution_json
    `,
      )
      .run(taskId, redact(executionJson));
  }

  getTaskExecution(taskId: string): string | null {
    try {
      const row = this.db.prepare('SELECT execution_json FROM task_executions WHERE task_id = ?').get(taskId) as any;
      return row?.execution_json || null;
    } catch {
      return null;
    }
  }

  saveTaskReview(taskId: string, reviewJson: string) {
    this.db
      .prepare(
        `
      INSERT INTO task_reviews (task_id, review_json)
      VALUES (?, ?)
      ON CONFLICT(task_id) DO UPDATE SET review_json = excluded.review_json
    `,
      )
      .run(taskId, redact(reviewJson));
  }

  getTaskReview(taskId: string): string | null {
    try {
      const row = this.db.prepare('SELECT review_json FROM task_reviews WHERE task_id = ?').get(taskId) as any;
      return row?.review_json || null;
    } catch {
      return null;
    }
  }

  close() {
    this.db.close();
  }
}
