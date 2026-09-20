import * as fs from 'node:fs';
import * as path from 'node:path';
import { TreeSitterParser, Symbol } from './treesitter.js';

import { execSync } from 'node:child_process';
import { MemoryEngine } from '../memory/engine.js';

export class CodeIndexer {
  private parser: TreeSitterParser;
  private memoryEngine: MemoryEngine;

  constructor(dbPath: string = 'loopcode.db') {
    this.parser = new TreeSitterParser('typescript');
    this.memoryEngine = new MemoryEngine(dbPath);
  }

  indexFile(filePath: string): Symbol[] {
    if (!fs.existsSync(filePath)) return [];

    // Clear existing graph for this file
    this.memoryEngine.deleteCodeGraphForFile(filePath);

    const content = fs.readFileSync(filePath, 'utf8');
    const symbols = this.parser.parse(content, filePath);

    // Save to SQLite
    this.memoryEngine.saveCodeGraphNodes(symbols);

    return symbols;
  }

  async indexDirectory(dirPath: string) {
    if (!fs.existsSync(dirPath)) return;

    // Get changed files from git
    const changedFiles: string[] = [];
    try {
      // Find all tracked files that are modified, and all untracked files
      const statusOutput = execSync('git status --porcelain', { cwd: dirPath, encoding: 'utf8' });
      const lines = statusOutput.split('\\n');
      for (const line of lines) {
        if (line.length > 3) {
          const file = line.substring(3).trim();
          if (file.endsWith('.ts') || file.endsWith('.js')) {
            changedFiles.push(path.join(dirPath, file));
          }
        }
      }
    } catch (e) {
      // fallback to indexing everything if git fails
    }

    if (changedFiles.length > 0) {
      console.log(`[Indexer] Incrementally indexing ${changedFiles.length} changed files...`);
      for (const file of changedFiles) {
        this.indexFile(file);
      }
    } else {
      // Full index or nothing changed. Let's do full index if first time.
      const existing = await this.memoryEngine.searchCodebase('');
      if (existing.length === 0) {
        console.log(`[Indexer] First run detected. Indexing entire directory...`);
        this.indexDirectoryRecursive(dirPath);
      } else {
        console.log(`[Indexer] No changed files detected.`);
      }
    }
  }

  private indexDirectoryRecursive(dirPath: string) {
    if (!fs.existsSync(dirPath)) return;
    const items = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dirPath, item.name);
      if (item.isDirectory() && item.name !== 'node_modules' && item.name !== '.git') {
        this.indexDirectoryRecursive(fullPath);
      } else if (item.isFile() && (item.name.endsWith('.ts') || item.name.endsWith('.js'))) {
        this.indexFile(fullPath);
      }
    }
  }

  getSymbolsForFile(filePath: string): Symbol[] {
    return this.memoryEngine.getSymbolsForFile(filePath);
  }

  async getAllSymbols(): Promise<Symbol[]> {
    try {
      const rows = this.memoryEngine.db
        .prepare(
          `
        SELECT id, file_path as path, name, type, line_start as lineStart, line_end as lineEnd, signature
        FROM code_graph_nodes
      `,
        )
        .all();
      return rows as any[];
    } catch {
      return [];
    }
  }
}
