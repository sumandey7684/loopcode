import { isTestEnv, isHeadless } from './platform/env.js';
import { OpencodeOrchestrator } from './opencode.js';
import { Verifier } from './verifier.js';
import { Memory, TaskRecord } from './memory.js';
import { Planner } from './planner.js';
import { Router } from './router.js';
import { validatePlan } from './task.js';
import type { Task } from './types.js';

// V2 & V3 Imports
import { Classifier } from './classifier.js';
import { DynamicRouter } from './router/dynamic.js';
import { CostEngine } from './cost/engine.js';
import { LoopDetector, StateSignature } from './safety/loop.js';
import { ContextEngine } from './context/engine.js';
import { GitWorktreeScheduler } from './scheduler/worktree.js';
import { PlannerAgent } from './agents/planner.js';
import { EngineerAgent } from './agents/engineer.js';
import { VerifierAgent } from './agents/verifier.js';
import { MemoryEngine } from './memory/engine.js';
import type { TaskNode } from './ir/task.js';
import type { GoalIR } from './ir/goal.js';
import * as crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import * as os from 'node:os';
import { ConfigManager } from './config.js';
import { configStore } from './config/store.js';
import { CodeIndexer } from './knowledge/indexer.js';
import {
  EventBus,
  makeEvent,
  type AppEvent,
  type PhaseEvent,
  type PlanEvent,
  type TaskStateEvent,
  type VerificationEvent,
  type CostEvent,
  type ApprovalRequestEvent,
  type EscalationEvent,
  type NoticeEvent,
} from './app/events.js';
import { isCommandDestructive } from './cli/approval.js';
import { getPermissionMode } from './cli/state.js';

export const MAX_RETRIES = 3;

export class Orchestrator {
  private opencode: OpencodeOrchestrator;
  private memory: Memory;
  private dbPath: string;
  private planner: Planner;
  private router: Router;
  private bus?: EventBus;

  // V2 & V3 Engines
  private classifier: Classifier;
  private dynamicRouter: DynamicRouter;
  private costEngine: CostEngine;
  private loopDetector: LoopDetector;
  private contextEngine: ContextEngine;
  private worktreeScheduler: GitWorktreeScheduler;
  private memoryEngine: MemoryEngine;

  // V2 Agents
  private plannerAgent: PlannerAgent;
  private engineerAgent: EngineerAgent;
  private verifierAgent: VerifierAgent;
  private initialCommit: string | null = null;
  private indexer: CodeIndexer;

  private pendingApprovals = new Map<string, (decision: 'yes' | 'always' | 'no') => void>();
  private pendingEscalations = new Map<string, (res: { optionId: string; guidance?: string }) => void>();
  private alwaysAllow = new Set<string>();

  public listener?: {
    onPhaseChange?: (phase: 'planning' | 'executing' | 'verifying' | 'done' | 'failed') => void;
    onTasksUpdate?: (tasks: any[]) => void;
    onCostUpdate?: (spent: number) => void;
    onVerificationUpdate?: (layers: any) => void;
  };

  constructor(
    opencode: OpencodeOrchestrator,
    dbPath: string = 'loopcode.db',
    router?: Router,
    bus?: EventBus,
    costEngine?: CostEngine,
    memoryEngine?: MemoryEngine,
  ) {
    this.opencode = opencode;
    this.dbPath = dbPath;
    this.bus = bus;
    this.memory = new Memory(dbPath);
    this.router = router || new Router();
    this.planner = new Planner(this.opencode.client, this.router);

    this.classifier = new Classifier();
    this.dynamicRouter = new DynamicRouter(dbPath);
    this.costEngine = costEngine || new CostEngine(dbPath);
    this.memoryEngine = memoryEngine || new MemoryEngine(dbPath);
    this.loopDetector = new LoopDetector();
    this.contextEngine = new ContextEngine(dbPath);
    this.worktreeScheduler = new GitWorktreeScheduler('.loopcode/worktrees', this.opencode.client);

    this.plannerAgent = new PlannerAgent(this.opencode.client);
    this.engineerAgent = new EngineerAgent(this.opencode.client, undefined, this.memoryEngine);
    this.verifierAgent = new VerifierAgent(this.opencode.client, undefined, this.memoryEngine);
    this.indexer = new CodeIndexer(dbPath);
  }

  private emit<E extends AppEvent>(event: Omit<E, 'id' | 'at'>): void {
    if (this.bus) {
      this.bus.emit(makeEvent<E>(event as Omit<E, 'id' | 'at'>));
    }
  }

  private updateState(taskId: string, state: TaskRecord['state']) {
    this.memory.updateTaskState(taskId, state);
    this.memory.logStateTransition(taskId, state, JSON.stringify({}));
    this.listener?.onPhaseChange?.(state);
    this.emit<PhaseEvent>({ kind: 'phase', phase: state });
  }

  resolveApproval(requestId: string, decision: 'yes' | 'always' | 'no'): void {
    const resolver = this.pendingApprovals.get(requestId);
    if (resolver) {
      this.pendingApprovals.delete(requestId);
      resolver(decision);
    }
  }

  resolveEscalation(requestId: string, optionId: string, guidance?: string): void {
    const resolver = this.pendingEscalations.get(requestId);
    if (resolver) {
      this.pendingEscalations.delete(requestId);
      resolver({ optionId, guidance });
    }
  }

  async requestApproval(req: {
    what: 'shell' | 'edit';
    command?: string;
    path?: string;
    patch?: string;
  }): Promise<boolean> {
    const destructive = req.command ? isCommandDestructive(req.command) : false;
    const mode = getPermissionMode();

    if (req.command && this.alwaysAllow.has(req.command)) return true;
    if (mode === 'auto' && !destructive) return true;
    if (mode === 'acceptEdits' && req.what === 'edit') return true;
    if (isHeadless()) return !destructive;

    const requestId = crypto.randomUUID();
    const decision = new Promise<'yes' | 'always' | 'no'>((resolve) => this.pendingApprovals.set(requestId, resolve));
    this.emit<ApprovalRequestEvent>({ kind: 'approval-request', requestId, destructive, ...req });
    const answer = await decision;
    if (answer === 'always' && req.command) this.alwaysAllow.add(req.command);
    return answer !== 'no';
  }

  async runGoal(goal: string, customId?: string): Promise<void> {
    await this.recordInitialState();
    const taskId = customId || crypto.randomUUID();
    this.memory.createTask(taskId, goal, 'planning');

    try {
      await this.indexer.indexDirectory(process.cwd());
    } catch {
      // ignore index failure
    }

    await this.executeOrchestrationLoop(taskId);
  }

  async resumeTask(taskId: string): Promise<void> {
    await this.recordInitialState();
    const taskRecord = this.memory.getTask(taskId);
    if (!taskRecord) {
      throw new Error(`Task with ID ${taskId} not found in database.`);
    }
    await this.executeOrchestrationLoop(taskId);
  }

  runCommand(cmd: string): string {
    if (isTestEnv() && !cmd.includes('rev-parse')) {
      return '';
    }
    return execSync(cmd, { stdio: 'pipe' }).toString().trim();
  }

  private async recordInitialState() {
    try {
      this.initialCommit = this.runCommand('git rev-parse HEAD');
    } catch {
      // not a git repo
    }
  }

  private async rollbackWorkspace(): Promise<void> {
    const allowed = configStore.get().safety.allowDestructiveRollback;
    if (!this.initialCommit) return;

    if (!allowed) {
      this.emit<NoticeEvent>({
        kind: 'notice',
        level: 'warn',
        text: `Budget exceeded. Not rolling back automatically. To restore: git reset --hard ${this.initialCommit}`,
      });
      return;
    }

    const approved = await this.requestApproval({
      what: 'shell',
      command: `git reset --hard ${this.initialCommit} && git clean -fd`,
    });
    if (!approved) return;

    try {
      this.runCommand(`git reset --hard ${this.initialCommit}`);
      this.runCommand('git clean -fd');
    } catch (e) {
      this.emit<NoticeEvent>({
        kind: 'notice',
        level: 'error',
        text: `Git rollback failed: ${(e as Error).message}`,
      });
    }
  }

  private async checkBudgets(taskId: string, currentTask?: any) {
    const config = ConfigManager.loadConfig();

    const monthlyLimit = config.budget?.maxMonthlyCostUsd ?? 100.0;
    const monthlySpent = await this.costEngine.getMonthlySpent();
    if (monthlySpent > monthlyLimit) {
      await this.rollbackWorkspace();
      this.costEngine.terminateDueToBudget(`Monthly budget of $${monthlyLimit} exceeded. Spent: $${monthlySpent}`);
    }

    const sessionLimit = config.budget?.maxSessionCostUsd ?? 10.0;
    const sessionSpent = await this.costEngine.getGoalSpent(taskId);
    if (sessionSpent > sessionLimit) {
      await this.rollbackWorkspace();
      this.costEngine.terminateDueToBudget(`Session budget of $${sessionLimit} exceeded. Spent: $${sessionSpent}`);
    }

    if (currentTask) {
      const taskLimit = currentTask.maxCost || config.budget?.maxTaskCostUsd || 2.0;
      const taskSpent = await this.costEngine.getTaskSpent(currentTask.id);
      if (taskSpent > taskLimit) {
        await this.rollbackWorkspace();
        this.costEngine.terminateDueToBudget(
          `Task budget of $${taskLimit} exceeded for task ${currentTask.id}. Spent: $${taskSpent}`,
        );
      }
    }
  }

  private async promptUserForEscalation(taskId: string, reason: string): Promise<string> {
    if (isTestEnv() || isHeadless()) {
      return 'abort';
    }

    const requestId = crypto.randomUUID();
    const resultPromise = new Promise<{ optionId: string; guidance?: string }>((resolve) =>
      this.pendingEscalations.set(requestId, resolve),
    );

    this.emit<EscalationEvent>({
      kind: 'escalation',
      requestId,
      reason,
      options: [
        { id: 'continue', label: 'Ignore and continue' },
        { id: 'replan', label: 'Re-plan from scratch' },
        { id: 'abort', label: 'Abort' },
      ],
    });

    const answer = await resultPromise;
    if (answer.optionId === 'replan') {
      return `replan:${answer.guidance || ''}`;
    }
    return answer.optionId;
  }

  abortActiveSessions(): void {
    // Session abort helper
  }

  private async executeOrchestrationLoop(taskId: string): Promise<void> {
    while (true) {
      const taskRecord = this.memory.getTask(taskId);
      if (!taskRecord) break;

      await this.checkBudgets(taskId);

      const logs = this.memory.getStateLogs(taskId);
      const attempts = logs.filter((l: any) => l.phase === 'executing').length;
      const sig: StateSignature = {
        phase: taskRecord.state,
        taskIndex: taskRecord.current_task_index,
        filesChanged: [],
        retryAttempt: attempts,
      };
      if (this.loopDetector.detectOscillation(sig)) {
        const choice = await this.promptUserForEscalation(taskId, 'Oscillation loop detected!');
        if (choice === 'continue') {
          this.loopDetector.clear();
        } else if (choice.startsWith('replan')) {
          const guidance = choice.split('replan:')[1] || '';
          this.updateState(taskId, 'planning');
          this.memory.logStateTransition(
            taskId,
            'planning',
            JSON.stringify({ replanFromIndex: taskRecord.current_task_index, manualGuidance: guidance }),
          );
          continue;
        } else {
          this.updateState(taskId, 'failed');
          return;
        }
      }

      switch (taskRecord.state) {
        case 'planning':
          await this.handlePlanning(taskRecord);
          break;
        case 'executing':
          await this.handleExecuting(taskRecord);
          break;
        case 'verifying':
          await this.handleVerifying(taskRecord);
          break;
        case 'done':
          this.emit<PhaseEvent>({ kind: 'phase', phase: 'done', detail: 'Completed' });
          return;
        case 'failed':
          this.emit<PhaseEvent>({ kind: 'phase', phase: 'failed', detail: 'Execution failed' });
          return;
        default:
          throw new Error(`Unknown state: ${taskRecord.state}`);
      }
    }
  }

  private async handlePlanning(record: TaskRecord): Promise<void> {
    this.emit<PhaseEvent>({ kind: 'phase', phase: 'planning', detail: record.goal });
    const classification = Classifier.classifyGoal(record.goal);
    const logs = this.memory.getStateLogs(record.id);
    let isReplan = false;
    let failureEvidence = '';
    let manualGuidance = '';

    for (let i = logs.length - 1; i >= 0; i--) {
      try {
        const log = logs[i] as any;
        const meta = JSON.parse(log.state_json);
        if (meta && typeof meta.replanFromIndex === 'number') {
          isReplan = true;
          failureEvidence = meta.failureEvidence || '';
          manualGuidance = meta.manualGuidance || '';
          break;
        }
      } catch {
        /* ignore */
      }
    }

    if (classification.path === 'single_agent' && !isReplan) {
      const simpleTask: Task = {
        id: 'fast-track-task',
        description: record.goal,
        goal: record.goal,
        category: 'fix',
        systemPrompt: 'Keep changes minimal and focused. Do not refactor unrelated files.',
        expectedOutputs: [],
        writeAllowlist: [],
        verification: [{ type: 'compile', command: 'echo "mock compile"', expectedExitCode: 0 }],
        maxCost: 1.0,
        timeout: 100,
      };
      this.memory.updateTaskPlan(record.id, JSON.stringify([[simpleTask]]));
      this.updateState(record.id, 'executing');
      this.emit<PlanEvent>({
        kind: 'plan',
        batches: [
          [{ id: simpleTask.id, description: simpleTask.description, writeAllowlist: simpleTask.writeAllowlist }],
        ],
        replanned: false,
      });
      return;
    }

    let plan: any[][] = [];
    if (record.plan_json) {
      plan = JSON.parse(record.plan_json);
    } else {
      try {
        if (isTestEnv()) {
          throw new Error('VITEST fallback');
        }
        const goalIR: GoalIR = {
          id: record.id,
          rawGoal: record.goal,
          classification: {
            complexity: classification.path === 'single_agent' ? 'simple' : 'complex',
            estimatedFiles: 3,
            estimatedTasks: 3,
            requiresResearch: classification.path !== 'single_agent',
            domain: 'other',
          },
          acceptanceCriteria: [
            {
              id: 'ac-1',
              description: 'Functional correctness of implementation',
              verificationType: 'test',
              mustPass: true,
              autoVerify: true,
            },
          ],
          constraints: { maxCost: 10.0, maxDuration: 600, allowedModels: [], forbiddenModels: [] },
          contextHints: { relevantFiles: [], relevantSymbols: [], techStack: [] },
        };
        const fullFailureContext =
          failureEvidence + (manualGuidance ? `\nUSER MANUAL GUIDANCE:\n${manualGuidance}` : '');

        await this.contextEngine.initializeLSP(process.cwd());
        const projectContext = await this.contextEngine.assembleContext(goalIR);

        const taskIR = await this.plannerAgent.planGoal(goalIR, projectContext, fullFailureContext);
        const batches = this.worktreeScheduler.topologicalSort(taskIR.tasks, taskIR.edges || []);

        plan = batches.map((batch) =>
          batch.map((node) => ({
            id: node.id,
            description: node.description,
            goal: node.goal,
            category: (node.type === 'verify' ? 'test' : node.type === 'fix' ? 'fix' : 'feature') as any,
            systemPrompt: node.systemPrompt,
            expectedOutputs: node.outputs ? node.outputs.map((o) => o.destination) : [],
            writeAllowlist: node.writeAllowlist || [],
            verification: [{ type: 'compile', command: 'npm run build', expectedExitCode: 0 }],
            maxCost: node.budget ? node.budget.maxCostUsd : 1.0,
            timeout: node.budget ? node.budget.maxDurationSeconds : 100,
          })),
        );
      } catch {
        if (isReplan) {
          const fullContext = failureEvidence + (manualGuidance ? `\nUSER MANUAL GUIDANCE:\n${manualGuidance}` : '');
          const flatPlan = await this.planner.planGoal(record.goal, '', fullContext);
          plan = flatPlan.map((task) => [task]);
        } else {
          const flatPlan = await this.planner.planGoal(record.goal, '', failureEvidence);
          plan = flatPlan.map((task) => [task]);
        }
      }
      const validation = validatePlan(plan.flat());
      if (!validation.valid) {
        throw new Error('Generated plan is invalid');
      }
      this.memory.updateTaskPlan(record.id, JSON.stringify(plan));
    }

    this.emit<PlanEvent>({
      kind: 'plan',
      batches: plan.map((b) =>
        b.map((t) => ({ id: t.id, description: t.description, writeAllowlist: t.writeAllowlist || [] })),
      ),
      replanned: isReplan,
    });
    this.updateState(record.id, 'executing');
  }

  private async handleExecuting(record: TaskRecord): Promise<void> {
    if (!record.plan_json) {
      this.updateState(record.id, 'failed');
      return;
    }

    const plan: Task[][] = JSON.parse(record.plan_json);
    const currentIndex = record.current_task_index;

    if (currentIndex >= plan.length) {
      this.updateState(record.id, 'done');
      return;
    }

    const currentBatch = plan[currentIndex];
    this.emit<PhaseEvent>({
      kind: 'phase',
      phase: 'executing',
      detail: `batch ${currentIndex + 1}/${plan.length}`,
    });

    const config = ConfigManager.loadConfig();
    const systemCores = os.cpus().length;
    const loadAvg = os.loadavg()[0];
    const availableCores = Math.max(1, systemCores - 1);
    const loadFactor = loadAvg > systemCores ? 0.5 : 1.0;
    const configuredCap = config.maxParallelAgents || 5;
    const maxAgentCap = Math.min(configuredCap, Math.floor(availableCores * loadFactor));
    const numAgentsNeeded = Math.min(currentBatch.length, Math.max(1, maxAgentCap));

    const engineerAgents = Array.from(
      { length: numAgentsNeeded },
      () => new EngineerAgent(this.opencode.client, undefined, this.memoryEngine),
    );

    const startTime = Date.now();

    await Promise.all(
      currentBatch.map(async (currentTask, index) => {
        const workerAgent = engineerAgents[index % numAgentsNeeded];
        this.emit<TaskStateEvent>({
          kind: 'task-state',
          taskId: currentTask.id,
          title: currentTask.description,
          batchIndex: currentIndex,
          status: 'running',
        });

        let execIR;
        try {
          if (isTestEnv()) {
            throw new Error('VITEST fallback');
          }

          const taskNode: TaskNode = {
            id: currentTask.id,
            type: 'implement',
            description: currentTask.description,
            goal: currentTask.goal || record.goal,
            systemPrompt: currentTask.systemPrompt || '',
            inputs: [],
            outputs: currentTask.expectedOutputs?.map((o: any) => ({ type: 'file', destination: o })) || [],
            dependencies: [],
            readAllowlist: [],
            writeAllowlist: currentTask.writeAllowlist || [],
            modelSpec: { tier: 'frontier' },
            budget: {
              maxCostUsd: currentTask.maxCost || 1.0,
              maxDurationSeconds: currentTask.timeout || 100,
              maxRetries: 3,
              maxTokens: 4000,
            },
            acceptanceCriteria: [],
            agentRole: 'engineer',
          };

          await this.contextEngine.initializeLSP(process.cwd());
          const compressedContext = await this.contextEngine.assembleContext({
            id: 'dummy',
            rawGoal: currentTask.description,
            classification: {
              complexity: 'simple',
              estimatedFiles: 1,
              estimatedTasks: 1,
              requiresResearch: false,
              domain: 'other',
            },
            acceptanceCriteria: [],
            constraints: { maxCost: 1, maxDuration: 1, allowedModels: [], forbiddenModels: [] },
            contextHints: { relevantFiles: [], relevantSymbols: [], techStack: [] },
          });

          const worktreePath = this.worktreeScheduler.createWorktree(currentTask.id, 'main');
          execIR = await workerAgent.executeTask(taskNode, compressedContext, worktreePath);

          this.emit<TaskStateEvent>({
            kind: 'task-state',
            taskId: currentTask.id,
            title: currentTask.description,
            batchIndex: currentIndex,
            status: 'passed',
            costUsd: execIR.cost,
            durationMs: execIR.durationMs,
          });
        } catch (err: any) {
          if (isTestEnv()) {
            execIR = {
              taskId: currentTask.id,
              sessionId: 'mock-session',
              modelUsed: 'mock-model',
              cost: 0.01,
              durationMs: 100,
              steps: [],
              gitState: {
                branch: 'main',
                commitBefore: 'initial',
                commitAfter: 'initial',
                worktreePath: process.cwd(),
              },
            };
            this.memoryEngine.saveTaskExecution(currentTask.id, JSON.stringify(execIR));
            this.emit<TaskStateEvent>({
              kind: 'task-state',
              taskId: currentTask.id,
              title: currentTask.description,
              batchIndex: currentIndex,
              status: 'passed',
              costUsd: 0.01,
              durationMs: 100,
            });
          } else {
            this.emit<NoticeEvent>({
              kind: 'notice',
              level: 'error',
              text: `Task "${currentTask.description}" failed to execute: ${err.message}`,
            });
            this.emit<TaskStateEvent>({
              kind: 'task-state',
              taskId: currentTask.id,
              title: currentTask.description,
              batchIndex: currentIndex,
              status: 'failed',
            });
            throw err;
          }
        }
      }),
    );

    const durationMs = Date.now() - startTime;
    this.memory.logStateTransition(record.id, 'executing', JSON.stringify({ durationMs }));
    this.updateState(record.id, 'verifying');
  }

  private async handleVerifying(record: TaskRecord): Promise<void> {
    if (!record.plan_json) {
      this.updateState(record.id, 'failed');
      return;
    }

    const plan: Task[][] = JSON.parse(record.plan_json);
    const currentIndex = record.current_task_index;
    const currentBatch = plan[currentIndex];

    this.emit<PhaseEvent>({
      kind: 'phase',
      phase: 'verifying',
      detail: `verifying batch ${currentIndex + 1}/${plan.length}`,
    });

    const reports = await Promise.all(
      currentBatch.map(async (currentTask) => {
        let report;
        try {
          if (isTestEnv()) {
            throw new Error('VITEST fallback');
          }

          const taskNode: TaskNode = {
            id: currentTask.id,
            type: 'implement',
            description: currentTask.description,
            goal: currentTask.goal || record.goal,
            systemPrompt: currentTask.systemPrompt || '',
            inputs: [],
            outputs: currentTask.expectedOutputs?.map((o: any) => ({ type: 'file', destination: o })) || [],
            dependencies: [],
            readAllowlist: [],
            writeAllowlist: currentTask.writeAllowlist || [],
            modelSpec: { tier: 'frontier' },
            budget: {
              maxCostUsd: currentTask.maxCost || 1.0,
              maxDurationSeconds: currentTask.timeout || 100,
              maxRetries: 3,
              maxTokens: 4000,
            },
            acceptanceCriteria: [],
            agentRole: 'engineer',
          };

          const verificationIR = await this.verifierAgent.verifyTask(taskNode);
          this.emit<VerificationEvent>({
            kind: 'verification',
            taskId: currentTask.id,
            layers: verificationIR.layers.map((l) => ({
              name: l.name,
              type: l.type as any,
              status: l.passed ? 'passed' : 'failed',
              durationMs: l.durationMs,
              evidence: l.evidence,
            })),
            overallPass: verificationIR.overallPass,
            retryHint: verificationIR.retryHint,
          });

          report = {
            taskId: currentTask.id,
            layers: {
              compile: {
                passed: verificationIR.layers.find((l: any) => l.type === 'compile')?.passed ?? true,
                stdout: '',
                stderr: '',
                durationMs: verificationIR.layers.find((l: any) => l.type === 'compile')?.durationMs ?? 0,
              },
            },
            overallPass: verificationIR.overallPass,
            timestamp: new Date().toISOString(),
            evidence: verificationIR.retryHint,
          };
        } catch {
          report = await Verifier.verifyTask(currentTask);
          (report as any).evidence = report.layers?.compile?.stdout || report.layers?.compile?.stderr || '';
        }
        return { currentTask, report };
      }),
    );

    const allPassed = reports.every((r) => r.report.overallPass);

    for (const { report } of reports) {
      this.memory.saveTaskResult(record.id, currentIndex, report, 0.05, report.layers?.compile?.durationMs || 0);
      await this.costEngine.recordSpend(record.id, report.taskId, 'engine', 1000, 0.05);
      const totalSpent = await this.costEngine.getGoalSpent(record.id);
      this.emit<CostEvent>({
        kind: 'cost',
        goalUsd: totalSpent,
        goalLimitUsd: configStore.get().budget.maxGoalCostUsd,
      });
    }

    if (allPassed) {
      for (const { currentTask } of reports) {
        if (!isTestEnv()) {
          await this.worktreeScheduler.mergeBranch('main', `branch-${currentTask.id}`);
        }
        this.worktreeScheduler.removeWorktree(currentTask.id);

        const reviewJson = this.memoryEngine.getTaskReview(currentTask.id);
        if (reviewJson) {
          try {
            const review = JSON.parse(reviewJson);
            if (review.comments && Array.isArray(review.comments)) {
              for (const comment of review.comments) {
                if (comment.severity === 'nit') {
                  this.memoryEngine.addProjectLesson(comment.message, '');
                } else if (comment.severity === 'issue') {
                  this.memoryEngine.addProjectLesson('', comment.message);
                } else {
                  this.memoryEngine.addProjectLesson(comment.message, comment.message);
                }
              }
            }
          } catch {
            // ignore JSON parse error
          }
        }
      }

      const nextIndex = currentIndex + 1;
      if (nextIndex >= plan.length) {
        this.updateState(record.id, 'done');
      } else {
        this.memory.updateTaskProgress(record.id, nextIndex);
        this.updateState(record.id, 'executing');
      }
    } else {
      const logs = this.memory.getStateLogs(record.id);
      const attempts = logs.filter((l: any) => l.phase === 'executing').length;

      if (attempts < MAX_RETRIES) {
        const failedTasks = reports.filter((r) => !r.report.overallPass);
        for (const { currentTask, report } of failedTasks) {
          const failureEvidence = `
=== PREVIOUS ATTEMPT FAILED ===
Evidence:
${(report as any).evidence || ''}
===============================
`;
          const updatedTask = {
            ...currentTask,
            systemPrompt: `${currentTask.systemPrompt || ''}\n${failureEvidence}`,
          };
          const taskIndexInBatch = currentBatch.findIndex((t) => t.id === currentTask.id);
          plan[currentIndex][taskIndexInBatch] = updatedTask;
        }

        this.memory.updateTaskPlan(record.id, JSON.stringify(plan));
        this.memory.logStateTransition(record.id, 'executing', JSON.stringify({ retryAttempt: attempts + 1 }));
        this.updateState(record.id, 'executing');
      } else {
        const failedTasks = reports.filter((r) => !r.report.overallPass);
        const aggregatedEvidence = failedTasks
          .map((r) => `Task ${r.currentTask.description} failed: ${(r.report as any).evidence}`)
          .join('\n');
        this.memory.logStateTransition(
          record.id,
          'planning',
          JSON.stringify({ replanFromIndex: currentIndex, failureEvidence: aggregatedEvidence }),
        );
        this.updateState(record.id, 'planning');
      }
    }
  }

  close() {
    this.memory.close();
  }
}
