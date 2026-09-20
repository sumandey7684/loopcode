import { isTestEnv } from '../platform/env.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import type { GoalIR } from '../ir/goal.js';
import { MemoryEngine } from '../memory/engine.js';
import { LSPClient } from '../knowledge/lsp.js';

export class ContextEngine {
  private memoryEngine: MemoryEngine;
  private lspClient: LSPClient;
  private lspInitialized = false;

  constructor(dbPath: string = 'loopcode.db') {
    this.memoryEngine = new MemoryEngine(dbPath);
    this.lspClient = new LSPClient();
  }

  async initializeLSP(projectRoot: string) {
    if (isTestEnv()) return;
    if (this.lspInitialized) return;
    try {
      await this.lspClient.initialize(projectRoot);
      this.lspInitialized = true;
    } catch (e) {
      // ignore
    }
  }
  /**
   * Compression: remove comments and excess whitespace to minimize token usage.
   */
  compressCode(code: string): string {
    // Remove single line comments
    let clean = code.replace(/\/\/.*$/gm, '');
    // Remove multi-line comments
    clean = clean.replace(/\/\*[\s\S]*?\*\//g, '');
    // Remove excess blank lines
    clean = clean.replace(/^\s*[\r\n]/gm, '');
    return clean.trim();
  }

  /**
   * Tokenizer-aware truncation (approx 4 chars per token)
   */
  truncateByTokens(text: string, maxTokens: number): string {
    const maxChars = maxTokens * 4;
    if (text.length <= maxChars) return text;
    return text.substring(0, maxChars) + '\n...[TRUNCATED FOR CONTEXT SIZE]...';
  }

  /**
   * Rank files based on text similarity to GoalIR
   */
  rankFiles(filePaths: string[], goal: GoalIR): string[] {
    const goalText = goal.rawGoal.toLowerCase();

    const scoredFiles = filePaths.map((file) => {
      let score = 0;
      const basename = path.basename(file).toLowerCase();
      if (goalText.includes(basename.split('.')[0])) {
        score += 10;
      }

      try {
        if (fs.existsSync(file)) {
          const content = fs.readFileSync(file, 'utf8').toLowerCase();
          const goalWords = goalText.split(/\s+/).filter((w) => w.length > 3);
          for (const word of goalWords) {
            if (content.includes(word)) score += 1;
          }
        }
      } catch (e) {
        /* ignore */
      }

      return { file, score };
    });

    scoredFiles.sort((a, b) => b.score - a.score);
    return scoredFiles.map((s) => s.file);
  }

  /**
   * Hierarchical Summarization Levels:
   * Level 0: Full original file content
   * Level 1: Compressed file content (no comments)
   * Level 2: Skeleton structure (class/interface declarations, method signatures)
   * Level 3: Symbol names only
   * Level 4: Git diff against HEAD
   */
  getSummarization(filePath: string, level: number): string {
    if (!fs.existsSync(filePath)) {
      return `File not found: ${filePath}`;
    }

    if (level === 4) {
      try {
        const diff = execSync(`git diff HEAD -- "${filePath}"`, { encoding: 'utf8' });
        if (diff.trim().length > 0) return diff;
        // fallback to skeleton if no diff
        level = 2;
      } catch (e) {
        level = 2; // fallback if not in git
      }
    }

    const content = fs.readFileSync(filePath, 'utf8');

    if (level === 0) {
      return this.truncateByTokens(content, 4000); // Max 4k tokens for full file
    }
    if (level === 1) {
      return this.truncateByTokens(this.compressCode(content), 3000);
    }
    if (level === 2) {
      // Basic skeleton regex extractor for TS/JS files
      const lines = content.split('\n');
      const skeleton = lines.filter((line) => {
        const trimmed = line.trim();
        return (
          trimmed.startsWith('export ') ||
          trimmed.startsWith('class ') ||
          trimmed.startsWith('interface ') ||
          trimmed.startsWith('function ') ||
          trimmed.startsWith('const ') ||
          trimmed.startsWith('let ')
        );
      });
      return this.truncateByTokens(skeleton.join('\n'), 2000);
    }
    if (level === 3) {
      // Symbols extractor
      const symbols: string[] = [];
      const regex = /(?:class|interface|function|const|let)\s+([a-zA-Z0-9_]+)/g;
      let match;
      while ((match = regex.exec(content)) !== null) {
        symbols.push(match[1]);
      }
      return `Symbols in ${path.basename(filePath)}: ${symbols.join(', ')}`;
    }
    return `File: ${path.basename(filePath)}`;
  }

  /**
   * Assemble context with proper compression and level selection based on file size.
   */
  async assembleContext(goal: GoalIR, explicitFilePaths: string[] = []): Promise<string> {
    let filePaths = [...explicitFilePaths];

    // Auto-discover files if none provided, using Semantic Search + Git
    if (filePaths.length === 0) {
      try {
        const searchResults = await this.memoryEngine.searchCodebase(goal.rawGoal, 5);
        for (const res of searchResults) {
          if (res.file_path && !filePaths.includes(res.file_path)) {
            filePaths.push(res.file_path);
          }
        }
      } catch (e) {
        // Fallback to git
      }

      if (filePaths.length === 0) {
        try {
          const output = execSync('git ls-files', { encoding: 'utf8' });
          filePaths = output
            .split('\\n')
            .filter((f) => f.endsWith('.ts') || f.endsWith('.js'))
            .map((f) => path.resolve(process.cwd(), f));
        } catch (e) {
          /* ignore */
        }
      }
    }

    const sortedPaths = this.rankFiles(filePaths, goal).slice(0, 10); // Take top 10 relevant files

    const sections: string[] = [];

    // Optional LSP Symbol enrichment
    if (this.lspInitialized && goal.contextHints?.relevantSymbols?.length) {
      for (const symbol of goal.contextHints.relevantSymbols) {
        // Assuming we could find definitions, this is a placeholder for actual LSP queries
        // which require file/line/char. We'd need to search CodeGraph for the symbol first.
        try {
          const nodes = this.memoryEngine.db
            .prepare('SELECT file_path, line_start FROM code_graph_nodes WHERE name = ? LIMIT 1')
            .get(symbol) as any;
          if (nodes && nodes.file_path && nodes.line_start) {
            const typeInfo = await this.lspClient.getTypeInfo(nodes.file_path, nodes.line_start, 5);
            sections.push(`--- LSP Type Info for Symbol: ${symbol} ---\\n${typeInfo}`);
          }
        } catch (e) {
          // ignore
        }
      }
    }

    for (const file of sortedPaths) {
      if (fs.existsSync(file)) {
        const stats = fs.statSync(file);
        // If file is larger than 50KB, use Level 4 (Diff) or Level 2 (Skeleton)
        // If > 10KB, use Level 1 (compressed)
        let level = 0;
        if (stats.size > 50000) level = 4;
        else if (stats.size > 10000) level = 1;

        sections.push(`--- File: ${file} (Summarization Level ${level}) ---\\n${this.getSummarization(file, level)}`);
      }
    }
    return this.truncateByTokens(sections.join('\\n\\n'), 16000); // Master limit
  }
}
