import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

/** Unique on-disk SQLite path for tests that cannot use :memory:. */
export function tempSqlitePath(prefix = 'loopcode-test'): string {
  return path.join(os.tmpdir(), `${prefix}-${crypto.randomUUID()}.db`);
}

/**
 * Best-effort remove of a SQLite DB + WAL/SHM.
 * On Windows, Bun may keep the file locked briefly after close(); never throw EBUSY
 * from cleanup hooks (assertions already ran).
 */
export function removeSqliteDb(dbPath: string, attempts = 30, delayMs = 50): void {
  if (!dbPath || dbPath === ':memory:') return;
  for (const file of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    for (let i = 0; i < attempts; i++) {
      try {
        if (fs.existsSync(file)) fs.unlinkSync(file);
        break;
      } catch (err: any) {
        const code = err?.code;
        if (code !== 'EBUSY' && code !== 'EPERM' && code !== 'EACCES') throw err;
        if (i === attempts - 1) return; // swallow lock — do not fail the suite
        Bun.sleepSync(delayMs);
      }
    }
  }
}

/** Checkpoint + close so Windows can release WAL locks more reliably. */
export function closeSqliteHandle(db: { exec?: (sql: string) => void; close: () => void } | null | undefined): void {
  if (!db) return;
  try {
    db.exec?.('PRAGMA wal_checkpoint(TRUNCATE);');
  } catch {
    /* ignore */
  }
  try {
    db.close();
  } catch {
    /* ignore */
  }
}
