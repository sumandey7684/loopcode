import type { OpencodeClient } from '@opencode-ai/sdk';
import type { Task, TaskCategory } from './types.js';
import { Router } from './router.js';

export class Planner {
  private client: OpencodeClient;
  private router: Router;

  constructor(client: OpencodeClient, router: Router) {
    this.client = client;
    this.router = router;
  }

  /**
   * Plans a goal by calling OpenCode to decompose it into sequential tasks.
   */
  async planGoal(goal: string, projectContext: string = '', failureContext?: string): Promise<Task[]> {
    // Generate a temporary session to execute the planning prompt
    const { data: session, error: createError } = await this.client.session.create({
      body: { title: 'Planning Session' },
    });

    if (createError || !session) {
      throw new Error(`Failed to create planning session: ${JSON.stringify(createError)}`);
    }

    const sessionId = session.id;

    const planningPrompt = `
You are a task planner for a software engineering project.
Break down the overall goal into a sequence of 1 to 5 concrete, incremental, sequential tasks.

Goal:
"${goal}"

Project context/files available:
${projectContext}
${failureContext ? `\nPREVIOUS ATTEMPT FAILURE CONTEXT:\nThe previous execution failed with the following errors. Please adjust your plan to avoid these issues:\n${failureContext}\n` : ''}
Rules:
1. Tasks must run sequentially. Order them logically (e.g. create files before editing, edit dependencies before dependents).
2. Each task must have concrete verification steps (compile, test, lint).
3. Assign each task a structured category: "test" | "docs" | "security" | "refactor" | "feature" | "fix" | "other".
4. The systemPrompt field should contain instructions telling the executor agent HOW to implement this specific task.
5. All tasks must return a JSON array matching the requested schema.
`;

    // Define the schema for the tasks array
    const taskSchema = {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              description: { type: 'string', description: 'Human-readable task description.' },
              goal: { type: 'string', description: 'Goal/instruction for this specific task.' },
              category: {
                type: 'string',
                enum: ['test', 'docs', 'security', 'refactor', 'feature', 'fix', 'other'],
                description: 'Category of the task.',
              },
              systemPrompt: {
                type: 'string',
                description: 'System guidelines/context to prepend to the executor agent.',
              },
              expectedOutputs: { type: 'array', items: { type: 'string' }, description: 'Files created or modified.' },
              writeAllowlist: {
                type: 'array',
                items: { type: 'string' },
                description: 'Files this task is permitted to modify.',
              },
              verification: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    type: { type: 'string', enum: ['compile', 'test', 'lint'] },
                    command: { type: 'string' },
                    expectedExitCode: { type: 'integer' },
                  },
                  required: ['type', 'command', 'expectedExitCode'],
                },
              },
              maxCost: { type: 'number', description: 'Maximum budget in USD, e.g. 2.00' },
              timeout: { type: 'integer', description: 'Timeout in seconds, e.g. 300' },
            },
            required: [
              'description',
              'goal',
              'category',
              'systemPrompt',
              'expectedOutputs',
              'writeAllowlist',
              'verification',
              'maxCost',
              'timeout',
            ],
          },
        },
      },
      required: ['tasks'],
    };

    try {
      // Call session.prompt requesting structured output
      const { data: result, error: promptError } = await this.client.session.prompt({
        path: { id: sessionId },
        body: {
          parts: [{ type: 'text', text: planningPrompt }],
          format: {
            type: 'json_schema',
            schema: taskSchema,
          },
        } as any,
      });

      if (promptError || !result) {
        throw new Error(`Planning prompt failed: ${JSON.stringify(promptError)}`);
      }

      // Read the structured output
      const structuredOutput = (result?.info as any)?.structured_output;
      if (!structuredOutput || !structuredOutput.tasks) {
        throw new Error(`Model failed to return structured output matching the schema: ${JSON.stringify(result)}`);
      }

      // Convert tasks response into Tasks with IDs
      const rawTasks = structuredOutput.tasks as any[];
      const tasks: Task[] = rawTasks.map((t) => ({
        id: crypto.randomUUID(),
        description: t.description,
        goal: t.goal,
        category: t.category as TaskCategory,
        systemPrompt: t.systemPrompt,
        expectedOutputs: t.expectedOutputs,
        writeAllowlist: t.writeAllowlist,
        verification: t.verification,
        maxCost: t.maxCost,
        timeout: t.timeout,
      }));

      return tasks;
    } finally {
      // Clean up the planning session
      try {
        await this.client.session.delete({ path: { id: sessionId } });
      } catch (err) {
        // Suppress cleanup errors
      }
    }
  }
}
