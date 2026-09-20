import { describe, it, expect, beforeAll } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { TreeSitterParser } from '../src/knowledge/treesitter.js';
import { CodeIndexer } from '../src/knowledge/indexer.js';
import { LSPClient } from '../src/knowledge/lsp.js';

process.env.VITEST = '1';

describe('Code Knowledge Engine', () => {
  const testFile = path.join(__dirname, 'fixtures', 'sample.ts');

  beforeAll(() => {
    if (!fs.existsSync(path.dirname(testFile))) {
      fs.mkdirSync(path.dirname(testFile), { recursive: true });
    }
    fs.writeFileSync(
      testFile,
      `export class TestClass {
  constructor() {}
  testMethod() {
    return true;
  }
}
export function testFunction() {
  return false;
}
export const testVar = 42;
`,
    );
  });

  it('TreeSitter parses symbols correctly', () => {
    const parser = new TreeSitterParser('typescript');
    const source = fs.readFileSync(testFile, 'utf8');
    const symbols = parser.parse(source, testFile);

    expect(symbols.length).toBeGreaterThan(0);
    expect(symbols.find((s) => s.name === 'TestClass')).toBeDefined();
    expect(symbols.find((s) => s.name === 'testFunction')).toBeDefined();
    expect(symbols.find((s) => s.name === 'testVar')).toBeDefined();
  });

  it('Indexer recursively finds and indexes files', async () => {
    const indexer = new CodeIndexer();
    await indexer.indexDirectory(path.dirname(testFile));

    const symbols = indexer.getSymbolsForFile(testFile);
    expect(symbols.length).toBeGreaterThan(0);
    expect(symbols.find((s: any) => s.name === 'TestClass')).toBeDefined();

    const all = await indexer.getAllSymbols();
    expect(all.length).toBeGreaterThan(0);
  }, 30000);

  it('LSPClient resolves properly', async () => {
    const client = new LSPClient();
    await expect(client.initialize(__dirname)).resolves.toBeUndefined();

    const defs = await client.goToDefinition(testFile, 2, 5);
    expect(defs).toEqual([]);

    const typeInfo = await client.getTypeInfo(testFile, 2, 5);
    expect(typeInfo).toBe('any');
  }, 30000);
});
