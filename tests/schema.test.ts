import { describe, it, expect } from 'bun:test';
import * as fs from 'node:fs';
import { SCHEMA_SQL } from '../src/db/schema.js';
import { Memory } from '../src/memory.js';

describe('schema', () => {
  it('src/db/schema.ts matches db/schema.sql', () => {
    const onDisk = fs.readFileSync('db/schema.sql', 'utf8').trim();
    expect(SCHEMA_SQL.trim()).toBe(onDisk);
  });

  it('A fresh DB created by Memory contains all tables from db/schema.sql', () => {
    const testDb = 'test_schema_tables.db';
    if (fs.existsSync(testDb)) fs.unlinkSync(testDb);

    const memory = new Memory(testDb);
    const tables = (memory as any).db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((row: any) => row.name);

    expect(tables).toContain('tasks');
    expect(tables).toContain('state_log');
    expect(tables).toContain('task_results');
    expect(tables).toContain('sessions');
    expect(tables).toContain('model_performance');
    expect(tables).toContain('working_memory');
    expect(tables).toContain('project_memory');
    expect(tables).toContain('cache_entries');

    memory.close();
    if (fs.existsSync(testDb)) fs.unlinkSync(testDb);
  });
});
