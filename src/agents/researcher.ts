import type { OpencodeClient } from '@opencode-ai/sdk';

export interface ResearchResult {
  relevantFiles: string[];
  relevantSymbols: string[];
  apiDetails: string;
}

export class ResearcherAgent {
  private client: OpencodeClient;
  private modelRoute: { providerID: string; modelID: string };

  constructor(client: OpencodeClient, modelRoute?: { providerID: string; modelID: string }) {
    this.client = client;
    this.modelRoute = modelRoute || { providerID: 'google', modelID: 'gemini-3.1-pro' };
  }

  /**
   * Performs codebase research to extract relevant files, symbols, and API context for a given goal.
   */
  async researchGoal(goal: string, fileTreeSummary: string = ''): Promise<ResearchResult> {
    const { data: session, error: createError } = await this.client.session.create({
      body: { title: 'Research Session' },
    });

    if (createError || !session) {
      throw new Error(`Failed to create research session: ${JSON.stringify(createError)}`);
    }

    const sessionId = session.id;

    const researchPrompt = `
You are a codebase research agent. Analyze the target goal and project file tree to identify which files and symbols are most relevant.

Goal:
"${goal}"

File Tree Summary:
${fileTreeSummary}

Provide a structured JSON output with:
1. "relevantFiles": Array of file paths that are likely targets for reading or modification.
2. "relevantSymbols": Array of symbol names (functions, classes, interfaces) to inspect.
3. "apiDetails": A summary explanation of any APIs or modules that must be integrated or modified.
`;

    const researchSchema = {
      type: 'object',
      properties: {
        relevantFiles: { type: 'array', items: { type: 'string' } },
        relevantSymbols: { type: 'array', items: { type: 'string' } },
        apiDetails: { type: 'string' },
      },
      required: ['relevantFiles', 'relevantSymbols', 'apiDetails'],
    };

    try {
      const { data: result, error: promptError } = await this.client.session.prompt({
        path: { id: sessionId },
        body: {
          parts: [{ type: 'text', text: researchPrompt }],
          model: this.modelRoute,
          format: {
            type: 'json_schema',
            schema: researchSchema,
          },
        } as any,
      });

      if (promptError || !result) {
        throw new Error(`Research prompt failed: ${JSON.stringify(promptError)}`);
      }

      const structuredOutput = (result?.info as any)?.structured_output;
      if (!structuredOutput) {
        throw new Error(`Researcher failed to return structured JSON: ${JSON.stringify(result)}`);
      }

      return {
        relevantFiles: structuredOutput.relevantFiles || [],
        relevantSymbols: structuredOutput.relevantSymbols || [],
        apiDetails: structuredOutput.apiDetails || '',
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
