-- db/schema.sql
-- Tasks and their state
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  goal TEXT NOT NULL,
  state TEXT NOT NULL,        -- 'planning', 'executing', 'verifying', 'done', 'failed'
  plan_json TEXT,             -- Array of Task objects
  current_task_index INTEGER DEFAULT 0,
  total_cost REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- State transitions (for recovery)
CREATE TABLE IF NOT EXISTS state_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  phase TEXT NOT NULL,
  state_json TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Task results
CREATE TABLE IF NOT EXISTS task_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  step_index INTEGER NOT NULL,
  verification_json TEXT,   -- VerificationReport
  cost REAL,
  duration_ms INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Simple file index (no embeddings, no vectors)
CREATE TABLE IF NOT EXISTS file_index (
  path TEXT PRIMARY KEY,
  language TEXT,
  line_count INTEGER,
  last_modified DATETIME,
  symbols_json TEXT         -- Array of {name, type, line}
);

-- --- Memory Engine v2 Layers ---

-- Model performance logs (for dynamic router)
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

-- Ephemeral working memory (session-scoped)
CREATE TABLE IF NOT EXISTS working_memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Task memory (append-only log outputs)
CREATE TABLE IF NOT EXISTS task_memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  log_text TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Project memory (lessons learned, conventions)
CREATE TABLE IF NOT EXISTS project_memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,        -- 'convention', 'pattern', 'lesson', 'api'
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  source_task_id TEXT,
  confidence REAL DEFAULT 1.0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Code Graph (structural navigation)
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
);

CREATE TABLE IF NOT EXISTS code_graph_edges (
  source_id TEXT,
  target_id TEXT,
  relationship TEXT,
  PRIMARY KEY (source_id, target_id, relationship)
);

CREATE VIRTUAL TABLE IF NOT EXISTS code_search USING fts5(
  id UNINDEXED,
  file_path,
  name,
  signature,
  docstring
);

-- Local Semantic Cache & Prompt cache
CREATE TABLE IF NOT EXISTS cache_entries (
  id TEXT PRIMARY KEY,
  query_embedding BLOB NOT NULL,   -- Serialized Float32Array
  response TEXT NOT NULL,
  model TEXT NOT NULL,
  cost REAL NOT NULL,
  similarity_threshold REAL DEFAULT 0.92,
  ttl_seconds INTEGER DEFAULT 86400,
  hit_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Goal memory (solutions, patterns)
CREATE TABLE IF NOT EXISTS goal_memory (
  id TEXT PRIMARY KEY,
  goal TEXT NOT NULL,
  plan_json TEXT NOT NULL,
  status TEXT NOT NULL,          -- 'success', 'failed'
  cost REAL NOT NULL,
  duration_ms INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Code embeddings (vector table fallback)
CREATE TABLE IF NOT EXISTS code_embeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,
  content_type TEXT NOT NULL,    -- 'function', 'class', 'comment', 'doc'
  symbol_name TEXT NOT NULL,
  line_start INTEGER NOT NULL,
  line_end INTEGER NOT NULL,
  embedding BLOB NOT NULL
);

-- Shared Agent Memory (V2)
CREATE TABLE IF NOT EXISTS task_plans (
  task_id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL,
  plan_json TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS task_executions (
  task_id TEXT PRIMARY KEY,
  execution_json TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS task_reviews (
  task_id TEXT PRIMARY KEY,
  review_json TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Extended schema for v3 session management
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  name TEXT,
  goal_id TEXT NOT NULL REFERENCES tasks(id),
  status TEXT DEFAULT 'active',  -- active, paused, archived
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
  message_count INTEGER DEFAULT 0,
  total_cost REAL DEFAULT 0.0,
  context_usage INTEGER DEFAULT 0,  -- tokens used
  git_branch TEXT,
  parent_session_id TEXT REFERENCES sessions(id),  -- for forks
  metadata TEXT  -- JSON: {model, permissionMode, etc.}
);

CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_name ON sessions(name);
CREATE INDEX IF NOT EXISTS idx_sessions_activity ON sessions(last_activity);

