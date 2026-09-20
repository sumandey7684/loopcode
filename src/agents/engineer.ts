import { isTestEnv } from '../platform/env.js';
import type { OpencodeClient } from '@opencode-ai/sdk';
import type { TaskNode } from '../ir/task.js';
import type { ExecutionIR, ExecutionStep } from '../ir/execution.js';
import { MemoryEngine } from '../memory/engine.js';
import { execSync } from 'child_process';
import * as crypto from 'node:crypto';

export class EngineerAgent {
  private client: OpencodeClient;
  private modelRoute: { providerID: string; modelID: string };
  private memoryEngine: MemoryEngine;

  constructor(
    client: OpencodeClient,
    modelRoute?: { providerID: string; modelID: string },
    memoryEngine?: MemoryEngine | string,
  ) {
    this.client = client;
    this.modelRoute = modelRoute || { providerID: 'anthropic', modelID: 'claude-5-sonnet' };
    this.memoryEngine =
      typeof memoryEngine === 'string'
        ? new MemoryEngine(memoryEngine)
        : (memoryEngine ?? new MemoryEngine('loopcode.db'));
  }

  /**
   * Executes a single TaskNode.
   */
  async executeTask(taskNode: TaskNode, researchContext: string = '', worktreePath?: string): Promise<ExecutionIR> {
    const { data: session, error: createError } = await this.client.session.create({
      body: { title: `Task execution: ${taskNode.id}` },
    });

    if (createError || !session) {
      throw new Error(`Failed to create engineer session: ${JSON.stringify(createError)}`);
    }

    const sessionId = session.id;
    const startTime = Date.now();

    // Get current git commit hash before execution
    let commitBefore = '';
    let currentBranch = 'main';
    try {
      commitBefore = execSync('git rev-parse HEAD', { cwd: worktreePath || process.cwd() })
        .toString()
        .trim();
      currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: worktreePath || process.cwd() })
        .toString()
        .trim();
    } catch (err) {
      // Not a git repo or git not found
      commitBefore = 'initial';
    }

    const fullPrompt = `
System Instructions:
${taskNode.systemPrompt}

Research Context:
${researchContext}

Task Goal:
${taskNode.description}
Goal: ${taskNode.goal}

Please complete the task. Only write within your allowlist: ${taskNode.writeAllowlist.join(', ')}.
`;

    const steps: ExecutionStep[] = [];
    const abortController = new AbortController();

    // Set up task timeout
    const timeoutSeconds = taskNode.budget.maxDurationSeconds;
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        abortController.abort();
        reject(new Error(`Engineer task timed out after ${timeoutSeconds} seconds`));
      }, timeoutSeconds * 1000);
    });

    try {
      steps.push({
        id: crypto.randomUUID(),
        type: 'thinking',
        timestamp: new Date().toISOString(),
        content: `Starting implementation for task ${taskNode.id}`,
        metadata: {},
      });

      const promptPromise = this.client.session.prompt({
        path: { id: sessionId },
        body: {
          parts: [{ type: 'text', text: fullPrompt }],
          model: this.modelRoute,
        },
        signal: abortController.signal,
      });

      const { data: result, error: promptError } = (await Promise.race([promptPromise, timeoutPromise])) as any;

      if (promptError) {
        throw new Error(`Execution prompt failed: ${JSON.stringify(promptError)}`);
      }

      steps.push({
        id: crypto.randomUUID(),
        type: 'thinking',
        timestamp: new Date().toISOString(),
        content: result?.info?.text || 'Prompt execution complete',
        metadata: {},
      });

      // Get git commit hash after execution
      let commitAfter = commitBefore;
      if (!isTestEnv()) {
        try {
          // Create an incremental commit representing the engineer modifications
          const statusOutput = execSync('git status --porcelain', { cwd: worktreePath || process.cwd() })
            .toString()
            .trim();
          if (statusOutput) {
            execSync('git add -A', { cwd: worktreePath || process.cwd() });
            execSync(`git commit -m "loopcode: implemented task ${taskNode.id}"`, {
              cwd: worktreePath || process.cwd(),
            });
            commitAfter = execSync('git rev-parse HEAD', { cwd: worktreePath || process.cwd() })
              .toString()
              .trim();
          }
        } catch (err) {
          // Suppress git commit failure, maybe no changes were made or not in git repo
        }
      }

      const durationMs = Date.now() - startTime;
      // Approximate cost tracking fallback
      const cost = taskNode.budget.maxCostUsd * (durationMs / (timeoutSeconds * 1000)) * 0.1; // estimate fraction

      const execIR = {
        taskId: taskNode.id,
        sessionId,
        modelUsed: `${this.modelRoute.providerID}/${this.modelRoute.modelID}`,
        cost: cost > 0 ? cost : 0.01,
        durationMs,
        steps,
        gitState: {
          branch: currentBranch,
          commitBefore,
          commitAfter,
          worktreePath,
        },
      };

      // Write to shared memory (V2)
      const memoryEngine = new MemoryEngine();
      memoryEngine.saveTaskExecution(taskNode.id, JSON.stringify(execIR));

      return execIR;
    } catch (error: any) {
      if (error.message.includes('timed out')) {
        try {
          await this.client.session.abort({ path: { id: sessionId } });
        } catch (abortErr) {
          // ignore abort error
        }
      }
      throw error;
    } finally {
      try {
        await this.client.session.delete({ path: { id: sessionId } });
      } catch (err) {
        // Suppress cleanup errors
      }
    }
  }
}
