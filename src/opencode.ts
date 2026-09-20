import { createOpencode, OpencodeClient } from '@opencode-ai/sdk';
import type { Task, TaskResult } from './types.js';
import { Router } from './router.js';
import { logger } from './app/logger.js';

export interface AuthStatus {
  authenticated: boolean;
  connected: string[];
  defaults: Record<string, string>;
  /** True when the opencode binary is missing from PATH (affects CLI fallback only). */
  binaryMissing: boolean;
}

export class OpencodeOrchestrator {
  public client: OpencodeClient;
  private serverCloseCallback: () => void;
  private router: Router;

  private constructor(client: OpencodeClient, serverCloseCallback: () => void, router?: Router) {
    this.client = client;
    this.serverCloseCallback = serverCloseCallback;
    this.router = router || new Router();
  }

  static async initialize(router?: Router, mockClient?: any, mockServer?: any): Promise<OpencodeOrchestrator> {
    let client = mockClient;
    let server = mockServer;
    if (!client || !server) {
      const res = await createOpencode();
      client = client ?? res.client;
      server = server ?? res.server;
    }

    const orchestrator = new OpencodeOrchestrator(client, () => server?.close(), router);
    // NOTE: no interactive auth prompting here. Callers use getAuthStatus() and drive the UI.
    return orchestrator;
  }

  async getAuthStatus(): Promise<AuthStatus> {
    try {
      const { data } = await this.client.provider.list();
      const connected = data?.connected ?? [];
      const defaults = data?.default ?? {};
      const envSatisfied = (data?.all ?? []).some((p) => (p.env ?? []).some((v) => Boolean(process.env[v])));
      return {
        authenticated: connected.length > 0 || envSatisfied,
        connected,
        defaults,
        binaryMissing: false,
      };
    } catch (err) {
      logger.warn('opencode', `Could not read provider status: ${(err as Error).message}`);
      return { authenticated: false, connected: [], defaults: {}, binaryMissing: false };
    }
  }

  async refreshRouterFromProviders(router: Router = this.router): Promise<void> {
    try {
      const { data: config } = await this.client.config.providers();
      if (config && config.providers) {
        const readyProviders = config.providers
          .filter((p: any) => p.state === 'ready' || p.configured)
          .map((p: any) => p.id);

        router.updateModelsBasedOnProviders(readyProviders, config.providers, config.default);
      }
    } catch (err) {
      // Ignore provider resolution errors to ensure fallback default routing is preserved
    }
  }

  async executeTask(task: Task): Promise<TaskResult> {
    const { data: session, error: createError } = await this.client.session.create({
      body: { title: `LoopCode Task: ${task.description}` },
    });

    if (!session || createError) {
      throw new Error('Failed to create OpenCode session: ' + JSON.stringify(createError));
    }

    const sessionId = session.id;

    // Start streaming events in the background for transparency
    const { stream } = await this.client.event.subscribe();

    // Asynchronous loop to print tool calls
    (async () => {
      try {
        for await (const event of stream) {
          if ((event as any).type === 'tool_call' || (event as any).event === 'tool_call') {
            // Simplified rendering of tool events
            console.log(`[Tool] ${JSON.stringify((event as any).data || (event as any).properties || event)}`);
          }
        }
      } catch (err) {
        // Stream may close abruptly
      }
    })();

    // Fold the system prompt/instructions into the main prompt
    const fullPrompt = `${task.systemPrompt}\n\nTask Goal:\n${task.goal}`;

    // Setup Timeout
    const abortController = new AbortController();

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        abortController.abort();
        reject(new Error(`Task timed out after ${task.timeout} seconds`));
      }, task.timeout * 1000);
    });

    try {
      const modelRoute = this.router.route(task);

      const promptPromise = this.client.session.prompt({
        path: { id: sessionId },
        body: {
          parts: [{ type: 'text', text: fullPrompt }],
          model: modelRoute,
        },
        signal: abortController.signal,
      });

      const { data: result, error: promptError } = await Promise.race([promptPromise, timeoutPromise]);

      if (promptError) {
        throw new Error('Prompt error: ' + JSON.stringify(promptError));
      }

      return {
        success: true,
        message: (result?.info as any)?.text,
      };
    } catch (error: any) {
      // If it timed out, try to gracefully abort the session on the server
      if (error.message.includes('timed out')) {
        try {
          await this.client.session.abort({ path: { id: sessionId } });
        } catch (abortErr) {
          console.error('Failed to abort session on server:', abortErr);
        }
      }
      return {
        success: false,
        message: error.message || String(error),
      };
    }
  }

  close() {
    this.serverCloseCallback();
  }
}
