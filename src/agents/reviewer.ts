import type { OpencodeClient } from '@opencode-ai/sdk';
import type { TaskNode } from '../ir/task.js';
import type { ExecutionIR } from '../ir/execution.js';
import { MemoryEngine } from '../memory/engine.js';
import { execSync } from 'child_process';

export interface ReviewComment {
  file: string;
  line: number;
  severity: 'nit' | 'suggestion' | 'issue' | 'blocking';
  message: string;
  code?: string;
}

export interface ReviewReport {
  passed: boolean;
  comments: ReviewComment[];
  confidence: number;
}

export class ReviewerAgent {
  private client: OpencodeClient;
  private modelRoute: { providerID: string; modelID: string };

  constructor(client: OpencodeClient, modelRoute?: { providerID: string; modelID: string }) {
    this.client = client;
    this.modelRoute = modelRoute || { providerID: 'anthropic', modelID: 'claude-4.8-opus' };
  }

  /**
   * Reviews the code modifications done during execution.
   */
  async reviewTask(taskNode: TaskNode, execIR?: ExecutionIR): Promise<ReviewReport> {
    if (!execIR) {
      const memory = new MemoryEngine();
      const execJson = memory.getTaskExecution(taskNode.id);
      if (!execJson) {
        throw new Error('No execution IR found in shared memory for task ' + taskNode.id);
      }
      execIR = JSON.parse(execJson) as ExecutionIR;
    }

    const { data: session, error: createError } = await this.client.session.create({
      body: { title: `Code Review: ${taskNode.id}` },
    });

    if (createError || !session) {
      throw new Error(`Failed to create reviewer session: ${JSON.stringify(createError)}`);
    }

    const sessionId = session.id;

    // Retrieve git diff
    let gitDiff = 'No diff available.';
    try {
      if (
        execIR.gitState.commitBefore &&
        execIR.gitState.commitAfter &&
        execIR.gitState.commitBefore !== execIR.gitState.commitAfter
      ) {
        gitDiff = execSync(`git diff ${execIR.gitState.commitBefore} ${execIR.gitState.commitAfter}`, {
          cwd: execIR.gitState.worktreePath || process.cwd(),
        }).toString();
      }
    } catch (err) {
      // Diff failed, fallback to plain text explanation
    }

    const reviewPrompt = `
You are an expert software reviewer. Review the modifications made by the engineering agent against the task requirements.

Analyze the code changes for:
1. Logic errors, typos, or security concerns.
2. Direct adherence to the task goal and allowlists.
3. Code style or formatting deviations.

Output a structured JSON response with:
1. "passed": boolean (true if approved, false if there are blocking issues)
2. "comments": Array of objects containing:
   - "file": string (the file name/path)
   - "line": integer (approximate line number)
   - "severity": "nit" | "suggestion" | "issue" | "blocking"
   - "message": string (review feedback)
   - "code": string (optional code suggestion block)
3. "confidence": float between 0.0 and 1.0

Original Task Goal:
"${taskNode.goal}"
Acceptance Criteria:
${taskNode.acceptanceCriteria.join('\\n')}

Git Diff:
\`\`\`diff
${gitDiff}
\`\`\`
`;

    const reviewSchema = {
      type: 'object',
      properties: {
        passed: { type: 'boolean' },
        comments: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              file: { type: 'string' },
              line: { type: 'integer' },
              severity: { type: 'string', enum: ['nit', 'suggestion', 'issue', 'blocking'] },
              message: { type: 'string' },
              code: { type: 'string' },
            },
            required: ['file', 'line', 'severity', 'message'],
          },
        },
        confidence: { type: 'number' },
      },
      required: ['passed', 'comments', 'confidence'],
    };

    try {
      const { data: result, error: promptError } = await this.client.session.prompt({
        path: { id: sessionId },
        body: {
          parts: [{ type: 'text', text: reviewPrompt }],
          model: this.modelRoute,
          format: {
            type: 'json_schema',
            schema: reviewSchema,
          },
        } as any,
      });

      if (promptError || !result) {
        throw new Error(`Reviewer prompt failed: ${JSON.stringify(promptError)}`);
      }

      const structuredOutput = (result?.info as any)?.structured_output;
      if (!structuredOutput) {
        throw new Error(`Reviewer failed to return structured JSON: ${JSON.stringify(result)}`);
      }

      return {
        passed: structuredOutput.passed,
        comments: structuredOutput.comments || [],
        confidence: structuredOutput.confidence ?? 1.0,
      };
    } finally {
      try {
        await this.client.session.delete({ path: { id: sessionId } });
      } catch (err) {
        // Suppress cleanup errors
      }
    }
  }
}
