import type { OpencodeClient } from '@opencode-ai/sdk';
import type { GoalIR } from '../ir/goal.js';
import type { TaskIR } from '../ir/task.js';
import { IRValidator } from '../ir/validator.js';
import { MemoryEngine } from '../memory/engine.js';
import * as crypto from 'node:crypto';

export class PlannerAgent {
  private client: OpencodeClient;
  private modelRoute: { providerID: string; modelID: string };

  constructor(client: OpencodeClient, modelRoute?: { providerID: string; modelID: string }) {
    this.client = client;
    this.modelRoute = modelRoute || { providerID: 'anthropic', modelID: 'claude-4.8-opus' };
  }

  /**
   * Decomposes the Goal IR into a structured Task IR.
   */
  async planGoal(goalIR: GoalIR, projectContext: string = '', failureContext?: string): Promise<TaskIR> {
    const { data: session, error: createError } = await this.client.session.create({
      body: { title: `Planning Session: ${goalIR.id}` },
    });

    if (createError || !session) {
      throw new Error(`Failed to create planning session: ${JSON.stringify(createError)}`);
    }

    const sessionId = session.id;

    const planningPrompt = `
You are a task planner for a software engineering project.
Break down the overall Goal IR into a sequence of concrete, incremental, sequential TaskNodes.

Rules:
1. Tasks must run sequentially. Order them logically.
2. Each task must have concrete verification steps (compile, test, lint, security, review).
3. Assign each task a structured category: "test" | "docs" | "security" | "refactor" | "feature" | "fix" | "other".
4. Assign each task a specific agent role: "planner" | "researcher" | "engineer" | "reviewer" | "verifier".
5. For tasks that can run in parallel (same batch), you MUST generate strict, non-overlapping \`writeAllowlist\` arrays to prevent Git merge conflicts.
6. All tasks must return a JSON array matching the requested schema.

Project context/files available:
${projectContext}

Goal IR:
${JSON.stringify(goalIR, null, 2)}
${
  failureContext
    ? `\
PREVIOUS ATTEMPT FAILURE CONTEXT:\
The previous execution failed with the following errors. Please adjust your plan to avoid these issues:\
${failureContext}\
`
    : ''
}
`;

    // Define the Zod schema properties as JSON Schema
    const taskIRJsonSchema = {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Unique task UUID' },
              type: { type: 'string', enum: ['plan', 'research', 'implement', 'review', 'verify', 'fix'] },
              description: { type: 'string', description: 'Human-readable description.' },
              inputs: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    type: { type: 'string' },
                    source: { type: 'string' },
                  },
                  required: ['type', 'source'],
                },
              },
              outputs: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    type: { type: 'string' },
                    destination: { type: 'string' },
                  },
                  required: ['type', 'destination'],
                },
              },
              dependencies: {
                type: 'array',
                items: { type: 'string' },
                description: 'Task IDs that must complete first.',
              },
              readAllowlist: { type: 'array', items: { type: 'string' } },
              writeAllowlist: { type: 'array', items: { type: 'string' } },
              modelSpec: {
                type: 'object',
                properties: {
                  tier: { type: 'string', enum: ['frontier', 'strong', 'efficient', 'local', 'auto'] },
                  preferredProvider: { type: 'string' },
                  fallbackProvider: { type: 'string' },
                },
                required: ['tier'],
              },
              budget: {
                type: 'object',
                properties: {
                  maxCostUsd: { type: 'number' },
                  maxDurationSeconds: { type: 'number' },
                  maxRetries: { type: 'number' },
                  maxTokens: { type: 'number' },
                },
                required: ['maxCostUsd', 'maxDurationSeconds', 'maxRetries', 'maxTokens'],
              },
              acceptanceCriteria: { type: 'array', items: { type: 'string' } },
              agentRole: { type: 'string', enum: ['planner', 'researcher', 'engineer', 'reviewer', 'verifier'] },
            },
            required: [
              'id',
              'type',
              'description',
              'inputs',
              'outputs',
              'dependencies',
              'readAllowlist',
              'writeAllowlist',
              'modelSpec',
              'budget',
              'acceptanceCriteria',
              'agentRole',
            ],
          },
        },
        edges: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              from: { type: 'string' },
              to: { type: 'string' },
              type: { type: 'string', enum: ['dependency', 'conflict', 'sequence'] },
            },
            required: ['from', 'to', 'type'],
          },
        },
        metadata: {
          type: 'object',
          properties: {
            totalEstimatedCost: { type: 'number' },
            totalEstimatedDuration: { type: 'number' },
            parallelizable: { type: 'boolean' },
            retryPolicy: {
              type: 'object',
              properties: {
                maxTotalRetries: { type: 'number' },
                backoffFactor: { type: 'number' },
              },
              required: ['maxTotalRetries', 'backoffFactor'],
            },
          },
          required: ['totalEstimatedCost', 'totalEstimatedDuration', 'parallelizable', 'retryPolicy'],
        },
      },
      required: ['tasks', 'edges', 'metadata'],
    };

    try {
      const { data: result, error: promptError } = await this.client.session.prompt({
        path: { id: sessionId },
        body: {
          parts: [{ type: 'text', text: planningPrompt }],
          model: this.modelRoute,
          format: {
            type: 'json_schema',
            schema: taskIRJsonSchema,
          },
        } as any,
      });

      if (promptError || !result) {
        throw new Error(`Planning prompt failed: ${JSON.stringify(promptError)}`);
      }

      const structuredOutput = (result?.info as any)?.structured_output;
      if (!structuredOutput) {
        throw new Error(`Model failed to return structured output matching the schema: ${JSON.stringify(result)}`);
      }

      // Convert tasks response into Tasks with valid schemas
      const taskIR: TaskIR = {
        id: crypto.randomUUID(),
        goalId: goalIR.id,
        phase: 'planning',
        tasks: structuredOutput.tasks,
        edges: structuredOutput.edges || [],
        metadata: structuredOutput.metadata,
      };

      // Perform IR validation check before returning
      IRValidator.validateGoalToTask(goalIR, taskIR);

      // Write to shared memory (V2)
      const memoryEngine = new MemoryEngine();
      memoryEngine.saveTaskPlan(taskIR.id, goalIR.id, JSON.stringify(taskIR));

      return taskIR;
    } finally {
      try {
        await this.client.session.delete({ path: { id: sessionId } });
      } catch (err) {
        // Suppress session deletion errors
      }
    }
  }
}
