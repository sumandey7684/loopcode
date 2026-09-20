import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
mock.module('../src/planner.js', () => {
  return {
    Planner: mock(() => {
      return {
        planGoal: mock().mockResolvedValue([
          {
            id: 'integration-task-1',
            description: 'Write test file',
            goal: 'Write file content',
            category: 'feature' as const,
            systemPrompt: '',
            expectedOutputs: ['tests/fixtures/test-repo/output.txt'],
            writeAllowlist: ['tests/fixtures/test-repo/output.txt'],
            verification: [
              {
                type: 'compile',
                command: 'node tests/fixtures/verify.cjs',
                expectedExitCode: 0,
              },
            ],
            maxCost: 1.0,
            timeout: 10,
          },
        ]),
      };
    }),
  };
});
import { Orchestrator } from '../src/orchestrator.js';
import { Memory } from '../src/memory.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

process.env.VITEST = '1';

describe('LoopCode Integration Flow', () => {
  const TEST_DB = 'test_integration.db';
  const FIXTURES_DIR = path.join(process.cwd(), 'tests', 'fixtures');
  const REPO_DIR = path.join(FIXTURES_DIR, 'test-repo');
  const OUTPUT_FILE = path.join(REPO_DIR, 'output.txt');
  const VERIFY_SCRIPT = path.join(FIXTURES_DIR, 'verify.cjs');

  function unlinkDb(dbPath: string) {
    for (const ext of ['', '-wal', '-shm']) {
      if (fs.existsSync(dbPath + ext)) {
        try {
          fs.unlinkSync(dbPath + ext);
        } catch {
          // ignore
        }
      }
    }
  }

  beforeEach(() => {
    // Setup test repository fixtures
    if (!fs.existsSync(REPO_DIR)) {
      fs.mkdirSync(REPO_DIR, { recursive: true });
    }
    if (fs.existsSync(OUTPUT_FILE)) {
      fs.unlinkSync(OUTPUT_FILE);
    }
    unlinkDb(TEST_DB);

    // Create a verification script that returns 0 if output.txt exists and contains "SUCCESS"
    const verifyScriptContent = `
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join(__dirname, 'test-repo', 'output.txt');
      if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8').includes('SUCCESS')) {
        process.exit(0);
      }
      process.exit(1);
    `;
    fs.writeFileSync(VERIFY_SCRIPT, verifyScriptContent, 'utf8');
  });

  afterEach(() => {
    // Cleanup
    try {
      if (fs.existsSync(OUTPUT_FILE)) fs.unlinkSync(OUTPUT_FILE);
      if (fs.existsSync(VERIFY_SCRIPT)) fs.unlinkSync(VERIFY_SCRIPT);
      if (fs.existsSync(REPO_DIR)) fs.rmdirSync(REPO_DIR);
      unlinkDb(TEST_DB);
    } catch {
      // Ignore cleanup issues
    }
  });

  it('successfully executes a full goal -> plan -> execute -> verify cycle', async () => {
    // Mock the OpencodeOrchestrator to write "SUCCESS" to output.txt when executeTask is called
    const mockClient = {
      config: {
        providers: mock().mockResolvedValue({
          data: {
            default: { model: 'anthropic/claude' },
            providers: [{ state: 'ready' }],
          },
        }),
      },
      session: {
        create: mock().mockResolvedValue({ data: { id: 'test-session' } }),
        prompt: mock().mockResolvedValue({ data: { info: { text: 'Done' } } }),
        abort: mock(),
      },
      event: {
        subscribe: mock().mockResolvedValue({ stream: [] }),
      },
    };

    const mockOpencode = {
      client: mockClient,
      executeTask: mock().mockImplementation(async (_task) => {
        // Mocking the agent file edit operation
        fs.writeFileSync(OUTPUT_FILE, 'SUCCESS', 'utf8');
        return { success: true, message: 'Wrote output file' };
      }),
    };

    const orchestrator = new Orchestrator(mockOpencode as any, TEST_DB);
    await orchestrator.runGoal('Create SUCCESS output');

    const memory = new Memory(TEST_DB);
    const allTasks = (memory as any).db.prepare('SELECT id, state FROM tasks').all();
    expect(allTasks.length).toBe(1);
    expect(allTasks[0].state).toBe('done'); // Verification succeeded!

    const results = memory.getTaskResults(allTasks[0].id) as any[];
    expect(results.length).toBe(1);

    const verificationReport = JSON.parse(results[0].verification_json);
    if (!verificationReport.overallPass) {
      console.log('=== VERIFICATION FAILED IN TEST ===');
      console.log('Compile layer:', JSON.stringify(verificationReport.layers.compile, null, 2));
    }
    expect(verificationReport.overallPass).toBe(true);
    expect(verificationReport.layers.compile.passed).toBe(true);

    memory.close();
  });
});
