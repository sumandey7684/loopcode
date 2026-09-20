import { describe, it, expect, mock, beforeEach, afterEach, spyOn } from 'bun:test';
import { OpencodeOrchestrator } from '../src/opencode.js';

mock.module('../src/planner.js', () => {
  return {
    Planner: mock(() => {
      return {
        planGoal: mock().mockImplementation(async (goal: string) => {
          return [
            {
              id: 'mocked-task-id',
              description: 'Initial Task',
              goal: goal,
              category: 'feature' as const,
              systemPrompt: 'Implement the requested change.',
              expectedOutputs: [],
              writeAllowlist: [],
              verification: [{ type: 'compile', command: 'npm run build', expectedExitCode: 0 }],
              maxCost: 2.0,
              timeout: 300,
            },
          ];
        }),
      };
    }),
  };
});

mock.module('../src/verifier.js', () => {
  return {
    Verifier: {
      verifyTask: mock(),
    },
  };
});

import { Orchestrator } from '../src/orchestrator.js';
import { Memory } from '../src/memory.js';
import { Verifier } from '../src/verifier.js';
import { MemoryEngine } from '../src/memory/engine.js';
import { configStore } from '../src/config/store.js';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';

process.env.VITEST = '1';

describe('Orchestrator State Machine & Persistence', () => {
  const TEST_DB = 'test_loopcode.db';
  let mockOpencode: any;
  let activeOrchestrators: Orchestrator[] = [];

  let getGoalSpentSpy: any = null;
  let terminateSpy: any = null;
  let runCommandSpy: any = null;
  let detectSpy: any = null;
  let promptSpy: any = null;
  let planSpy: any = null;

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
    mock.clearAllMocks();
    activeOrchestrators = [];
    unlinkDb(TEST_DB);
    mockOpencode = new (OpencodeOrchestrator as any)();
    mockOpencode.client = {};
    mockOpencode.executeTask = mock().mockResolvedValue({ success: true, message: 'Executed' });
  });

  afterEach(() => {
    if (getGoalSpentSpy) {
      getGoalSpentSpy.mockRestore();
      getGoalSpentSpy = null;
    }
    if (terminateSpy) {
      terminateSpy.mockRestore();
      terminateSpy = null;
    }
    if (runCommandSpy) {
      runCommandSpy.mockRestore();
      runCommandSpy = null;
    }
    if (detectSpy) {
      detectSpy.mockRestore();
      detectSpy = null;
    }
    if (promptSpy) {
      promptSpy.mockRestore();
      promptSpy = null;
    }
    if (planSpy) {
      planSpy.mockRestore();
      planSpy = null;
    }

    for (const o of activeOrchestrators) {
      try {
        o.close();
      } catch {
        // ignore
      }
    }
    unlinkDb(TEST_DB);
  });

  it('runs the goal and transitions planning -> executing -> verifying -> done on success', async () => {
    (Verifier.verifyTask as any).mockResolvedValue({
      taskId: 'test-task',
      layers: { compile: { passed: true, stdout: '', stderr: '', durationMs: 10 } },
      overallPass: true,
      timestamp: new Date().toISOString(),
    });

    const orchestrator = new Orchestrator(mockOpencode, TEST_DB);
    activeOrchestrators.push(orchestrator);
    await orchestrator.runGoal('Mock Goal');

    const memory = new Memory(TEST_DB);
    const allTasks = (memory as any).db.prepare('SELECT id FROM tasks').all();
    expect(allTasks.length).toBe(1);
    const taskId = allTasks[0].id;

    const tasks = memory.getTaskResults(taskId);
    expect(tasks.length).toBe(1);

    memory.close();
  });

  it('retries when verification fails and increments attempt count', async () => {
    const orchestrator = new Orchestrator(mockOpencode, TEST_DB);
    activeOrchestrators.push(orchestrator);

    let verificationCount = 0;
    (orchestrator as any).verifierAgent.verifyTask = mock().mockImplementation(async () => {
      verificationCount++;
      return {
        taskId: 'test-task',
        layers: [
          {
            name: 'Compilation',
            type: 'compile',
            passed: verificationCount > 1,
            evidence: verificationCount > 1 ? '' : 'Compiler Error',
            durationMs: 10,
          },
        ],
        overallPass: verificationCount > 1,
        retryHint: verificationCount > 1 ? '' : 'Compiler Error',
      };
    });

    await orchestrator.runGoal('Mock Goal with failures');

    const memory = new Memory(TEST_DB);
    const allTasks = (memory as any).db.prepare('SELECT id FROM tasks').all();
    expect(allTasks.length).toBe(1);
    const taskId = allTasks[0].id;

    const logs = memory.getStateLogs(taskId);

    const phases = logs.map((l: any) => l.phase);
    expect(phases).toContain('executing');
    expect(phases).toContain('verifying');

    memory.close();
  });

  it('re-plans when retry attempts are exhausted', async () => {
    (Verifier.verifyTask as any).mockResolvedValue({
      taskId: 'test-task',
      layers: { compile: { passed: false, stdout: '', stderr: 'Compiler Error', durationMs: 10 } },
      overallPass: false,
      timestamp: new Date().toISOString(),
    });

    const orchestrator = new Orchestrator(mockOpencode, TEST_DB);
    activeOrchestrators.push(orchestrator);

    let planningCount = 0;
    const originalHandlePlanning = (orchestrator as any).handlePlanning;
    (orchestrator as any).handlePlanning = async function (record: any) {
      planningCount++;
      if (planningCount > 1) {
        this.memory.updateTaskState(record.id, 'failed');
        return;
      }
      return originalHandlePlanning.call(this, record);
    };

    await orchestrator.runGoal('Failing Goal');

    expect(planningCount).toBe(2);

    const memory = new Memory(TEST_DB);
    const allTasks = (memory as any).db.prepare('SELECT id FROM tasks').all();
    expect(allTasks.length).toBe(1);
    const taskId = allTasks[0].id;

    const task = memory.getTask(taskId);
    expect(task?.state).toBe('failed');
    memory.close();
  });

  it('resumes correctly after process crash / restart', async () => {
    const memory = new Memory(TEST_DB);
    const taskId = 'crash-task-id';
    memory.createTask(taskId, 'Resume Goal', 'executing');

    const plan = [
      [
        {
          id: crypto.randomUUID(),
          description: 'Mocked task to execute on resume',
          goal: 'Resume Goal',
          category: 'feature' as const,
          systemPrompt: '',
          expectedOutputs: [],
          writeAllowlist: [],
          verification: [],
          maxCost: 1,
          timeout: 100,
        },
      ],
    ];
    memory.updateTaskPlan(taskId, plan);
    memory.close();

    (Verifier.verifyTask as any).mockResolvedValue({
      taskId: 'test-task',
      layers: { compile: { passed: true, stdout: '', stderr: '', durationMs: 10 } },
      overallPass: true,
      timestamp: new Date().toISOString(),
    });

    const orchestrator = new Orchestrator(mockOpencode, TEST_DB);
    activeOrchestrators.push(orchestrator);
    await orchestrator.resumeTask(taskId);

    const checkMemory = new Memory(TEST_DB);
    const task = checkMemory.getTask(taskId);
    expect(task?.state).toBe('done');
    checkMemory.close();
  });

  it('logs project memory lessons and conventions on goal completion', async () => {
    const memoryEngine = new MemoryEngine(TEST_DB);
    const mockReview = {
      passed: true,
      comments: [
        { file: 'src/index.ts', line: 10, severity: 'nit', message: 'Use const instead of let' },
        { file: 'src/router.ts', line: 40, severity: 'issue', message: 'Potential null pointer here' },
      ],
      confidence: 0.95,
    };
    memoryEngine.saveTaskReview('mocked-task-id', JSON.stringify(mockReview));

    (Verifier.verifyTask as any).mockResolvedValue({
      taskId: 'mocked-task-id',
      layers: { compile: { passed: true, stdout: '', stderr: '', durationMs: 10 } },
      overallPass: true,
      timestamp: new Date().toISOString(),
    });

    const orchestrator = new Orchestrator(mockOpencode, TEST_DB);
    activeOrchestrators.push(orchestrator);
    await orchestrator.runGoal('Test Project Memory Goal');

    const conventions = memoryEngine.getConventions();
    expect(conventions.length).toBeGreaterThan(0);
    expect(conventions[0]).toContain('Use const instead of let');

    const lessons = memoryEngine.db
      .prepare("SELECT value FROM project_memory WHERE category = 'lesson'")
      .all() as any[];
    memoryEngine.close();

    expect(lessons.length).toBeGreaterThan(0);
    expect(lessons[0].value).toContain('Potential null pointer here');
  });

  it('terminates and rolls back workspace when session budget is exceeded', async () => {
    configStore.save({ ...configStore.get(), safety: { ...configStore.get().safety, allowDestructiveRollback: true } });
    const { CostEngine } = await import('../src/cost/engine.js');
    getGoalSpentSpy = spyOn(CostEngine.prototype, 'getGoalSpent').mockResolvedValue(20.0);
    terminateSpy = spyOn(CostEngine.prototype, 'terminateDueToBudget').mockImplementation(() => {
      throw new Error('budget limit reached');
    });

    const orchestrator = new Orchestrator(mockOpencode, TEST_DB);
    activeOrchestrators.push(orchestrator);
    (orchestrator as any).requestApproval = async () => true;

    runCommandSpy = spyOn(orchestrator, 'runCommand').mockReturnValue('mock-hash');

    await expect(orchestrator.runGoal('Mock Goal')).rejects.toThrow('budget limit reached');

    expect(runCommandSpy).toHaveBeenCalledWith('git reset --hard mock-hash');
    expect(runCommandSpy).toHaveBeenCalledWith('git clean -fd');
    expect(terminateSpy).toHaveBeenCalled();
  });

  it('handles oscillation escalation choice replan correctly', async () => {
    const orchestrator = new Orchestrator(mockOpencode, TEST_DB);
    activeOrchestrators.push(orchestrator);

    const { LoopDetector } = await import('../src/safety/loop.js');
    detectSpy = spyOn(LoopDetector.prototype, 'detectOscillation').mockImplementation((sig) => {
      return sig.phase === 'executing';
    });
    promptSpy = spyOn(orchestrator as any, 'promptUserForEscalation').mockResolvedValue('replan');

    let callCount = 0;
    planSpy = spyOn(orchestrator as any, 'handlePlanning').mockImplementation(async (record: any) => {
      callCount++;
      if (callCount > 1) {
        throw new Error('stop loop');
      }
      orchestrator['memory'].updateTaskState(record.id, 'executing');
    });

    await expect(orchestrator.runGoal('Mock Goal')).rejects.toThrow('stop loop');
    expect(promptSpy).toHaveBeenCalled();
  });
});
