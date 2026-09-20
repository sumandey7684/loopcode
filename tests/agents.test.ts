import { describe, it, expect, mock, beforeEach } from 'bun:test';
mock.module('child_process', () => ({
  execSync: mock((cmd: string) => {
    if (cmd.includes('git rev-parse --abbrev-ref')) return 'main';
    if (cmd.includes('git rev-parse')) return 'mock-git-commit-hash';
    if (cmd.includes('git status')) return ' M db/schema.sql'; // mock dirty status
    if (cmd.includes('npm run build')) return 'build success';
    if (cmd.includes('npm run test')) return 'test success';
    return '';
  }),
}));
import { PlannerAgent } from '../src/agents/planner.js';
import { ResearcherAgent } from '../src/agents/researcher.js';
import { EngineerAgent } from '../src/agents/engineer.js';
import { ReviewerAgent } from '../src/agents/reviewer.js';
import { VerifierAgent } from '../src/agents/verifier.js';
import type { GoalIR } from '../src/ir/goal.js';
import type { TaskNode } from '../src/ir/task.js';
import type { ExecutionIR } from '../src/ir/execution.js';

process.env.VITEST = '1';
describe('LoopCode Agents', () => {
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      session: {
        create: mock().mockResolvedValue({ data: { id: 'test-session-id' } }),
        prompt: mock(),
        delete: mock().mockResolvedValue({}),
      },
    };
  });

  describe('PlannerAgent', () => {
    it('decomposes goals into a valid TaskIR structure', async () => {
      const goalIR: GoalIR = {
        id: 'goal-1',
        rawGoal: 'Simple goal',
        classification: {
          complexity: 'simple',
          estimatedFiles: 1,
          estimatedTasks: 1,
          requiresResearch: false,
          domain: 'other',
        },
        acceptanceCriteria: [
          { id: 'ac1', description: 'AC1', verificationType: 'test', mustPass: true, autoVerify: true },
        ],
        constraints: { maxCost: 1.0, maxDuration: 60, allowedModels: [], forbiddenModels: [] },
        contextHints: { relevantFiles: [], relevantSymbols: [], techStack: [] },
      };

      const mockPlanOutput = {
        tasks: [
          {
            id: 'task-1',
            type: 'implement',
            description: 'Task description',
            goal: 'Task goal',
            systemPrompt: 'System prompt',
            inputs: [],
            outputs: [],
            dependencies: [],
            readAllowlist: [],
            writeAllowlist: [],
            modelSpec: { tier: 'frontier' },
            budget: { maxCostUsd: 0.5, maxDurationSeconds: 100, maxRetries: 3, maxTokens: 2000 },
            acceptanceCriteria: ['AC1'],
            agentRole: 'engineer',
          },
        ],
        edges: [],
        metadata: {
          totalEstimatedCost: 0.5,
          totalEstimatedDuration: 100,
          parallelizable: false,
          retryPolicy: { maxTotalRetries: 3, backoffFactor: 2 },
        },
      };

      mockClient.session.prompt.mockResolvedValue({
        data: {
          info: {
            structured_output: mockPlanOutput,
          },
        },
      });

      const planner = new PlannerAgent(mockClient);
      const taskIR = await planner.planGoal(goalIR, '');

      expect(taskIR.goalId).toBe('goal-1');
      expect(taskIR.tasks.length).toBe(1);
      expect(taskIR.tasks[0].id).toBe('task-1');
    });
  });

  describe('ResearcherAgent', () => {
    it('returns identified files and symbols', async () => {
      mockClient.session.prompt.mockResolvedValue({
        data: {
          info: {
            structured_output: {
              relevantFiles: ['src/config.ts'],
              relevantSymbols: ['ConfigManager'],
              apiDetails: 'TOML parsing API',
            },
          },
        },
      });

      const researcher = new ResearcherAgent(mockClient);
      const res = await researcher.researchGoal('Check config');

      expect(res.relevantFiles).toContain('src/config.ts');
      expect(res.relevantSymbols).toContain('ConfigManager');
      expect(res.apiDetails).toBe('TOML parsing API');
    });
  });

  describe('EngineerAgent', () => {
    it('executes a task node and returns execution steps', async () => {
      const taskNode: TaskNode = {
        id: 'task-1',
        type: 'implement',
        description: 'Test description',
        goal: 'Test goal',
        systemPrompt: 'System prompt',
        inputs: [],
        outputs: [],
        dependencies: [],
        readAllowlist: [],
        writeAllowlist: [],
        modelSpec: { tier: 'strong' },
        budget: { maxCostUsd: 1.0, maxDurationSeconds: 10, maxRetries: 3, maxTokens: 2000 },
        acceptanceCriteria: [],
        agentRole: 'engineer',
      };

      mockClient.session.prompt.mockResolvedValue({
        data: {
          info: { text: 'code changes applied successfully' },
        },
      });

      const engineer = new EngineerAgent(mockClient);
      const execIR = await engineer.executeTask(taskNode, '');

      expect(execIR.taskId).toBe('task-1');
      expect(execIR.steps.length).toBeGreaterThan(0);
      expect(execIR.modelUsed).toContain('anthropic/claude-5-sonnet');
    });
  });

  describe('ReviewerAgent', () => {
    it('approves compliant modifications', async () => {
      const taskNode: TaskNode = {
        id: 'task-1',
        type: 'implement',
        description: 'Test description',
        goal: 'Test goal',
        systemPrompt: 'System prompt',
        inputs: [],
        outputs: [],
        dependencies: [],
        readAllowlist: [],
        writeAllowlist: [],
        modelSpec: { tier: 'strong' },
        budget: { maxCostUsd: 1.0, maxDurationSeconds: 100, maxRetries: 3, maxTokens: 2000 },
        acceptanceCriteria: [],
        agentRole: 'engineer',
      };

      const execIR: ExecutionIR = {
        taskId: 'task-1',
        sessionId: 'session-id',
        modelUsed: 'claude-5-sonnet',
        cost: 0.05,
        durationMs: 500,
        steps: [],
        gitState: { branch: 'main', commitBefore: 'abc', commitAfter: 'abc' },
      };

      mockClient.session.prompt.mockResolvedValue({
        data: {
          info: {
            structured_output: {
              passed: true,
              comments: [],
              confidence: 0.95,
            },
          },
        },
      });

      const reviewer = new ReviewerAgent(mockClient);
      const report = await reviewer.reviewTask(taskNode, execIR);

      expect(report.passed).toBe(true);
      expect(report.confidence).toBe(0.95);
    });
  });

  describe('VerifierAgent', () => {
    it('executes verification layers', async () => {
      const taskNode: TaskNode = {
        id: 'task-1',
        type: 'implement',
        description: 'Test description',
        goal: 'Test goal',
        systemPrompt: 'System prompt',
        inputs: [],
        outputs: [],
        dependencies: [],
        readAllowlist: [],
        writeAllowlist: [],
        modelSpec: { tier: 'strong' },
        budget: { maxCostUsd: 1.0, maxDurationSeconds: 100, maxRetries: 3, maxTokens: 2000 },
        acceptanceCriteria: [],
        agentRole: 'engineer',
      };

      const execIR: ExecutionIR = {
        taskId: 'task-1',
        sessionId: 'session-id',
        modelUsed: 'claude-5-sonnet',
        cost: 0.05,
        durationMs: 500,
        steps: [],
        gitState: { branch: 'main', commitBefore: 'abc', commitAfter: 'abc' },
      };

      // Mock independent reviewer response
      mockClient.session.prompt.mockResolvedValue({
        data: {
          info: {
            structured_output: {
              passed: true,
              comments: [],
              confidence: 0.95,
            },
          },
        },
      });

      const verifier = new VerifierAgent(mockClient);
      const verifyIR = await verifier.verifyTask(taskNode, execIR);

      expect(verifyIR.taskId).toBe('task-1');
      expect(verifyIR.layers.length).toBeGreaterThan(0);
    });
  });
});
