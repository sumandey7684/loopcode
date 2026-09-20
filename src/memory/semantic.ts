import { Database } from 'bun:sqlite';
import * as sqliteVec from 'sqlite-vec';
import { FlagEmbedding, EmbeddingModel } from 'fastembed';

export class SemanticMemory {
  private db: Database;
  private embedder?: FlagEmbedding;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    sqliteVec.load(this.db);

    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS semantic_cache USING vec0(
        id INTEGER PRIMARY KEY,
        embedding float[384]
      );
      CREATE TABLE IF NOT EXISTS semantic_texts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        text TEXT NOT NULL,
        metadata TEXT
      );
    `);
  }

  async initEmbedder() {
    if (!this.embedder) {
      this.embedder = await FlagEmbedding.init({ model: EmbeddingModel.BGESmallENV15 });
    }
  }

  async store(text: string, metadata: any) {
    await this.initEmbedder();
    const embeddings = await this.embedder!.embed([text]);
    const vec = [];
    for await (const batch of embeddings) {
      for (const v of batch) {
        for (let i = 0; i < v.length; i++) {
          vec.push(v[i]);
        }
      }
    }

    const stmt = this.db.prepare('INSERT INTO semantic_texts (text, metadata) VALUES (?, ?)');
    const info = stmt.run(text, JSON.stringify(metadata));
    const rowId = info.lastInsertRowid;

    const vecStmt = this.db.prepare('INSERT INTO semantic_cache (id, embedding) VALUES (?, ?)');
    vecStmt.run(rowId, new Float32Array(vec));
  }

  async search(query: string, limit = 5) {
    await this.initEmbedder();
    const embeddings = await this.embedder!.embed([query]);
    const vec = [];
    for await (const batch of embeddings) {
      for (const v of batch) {
        for (let i = 0; i < v.length; i++) {
          vec.push(v[i]);
        }
      }
    }

    const stmt = this.db.prepare(`
      SELECT t.text, t.metadata, v.distance 
      FROM semantic_cache v
      JOIN semantic_texts t ON t.id = v.id
      WHERE v.embedding MATCH ? AND k = ?
      ORDER BY v.distance ASC
    `);

    const results = stmt.all(new Float32Array(vec), limit) as any[];
    return results.map((r) => ({
      text: r.text,
      metadata: JSON.parse(r.metadata),
      distance: r.distance,
    }));
  }
}
