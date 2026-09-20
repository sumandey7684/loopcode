import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { OpencodeOrchestrator } from '../src/opencode.js';

describe('OpencodeOrchestrator', () => {
  beforeEach(() => {
    mock.clearAllMocks();
  });

  it('returns auth status from getAuthStatus() without throwing on initialize()', async () => {
    const mockClient = {
      provider: {
        list: mock().mockResolvedValue({
          data: {
            default: {},
            connected: [],
            all: [
              {
                id: 'anthropic',
                name: 'Anthropic',
                env: ['ANTHROPIC_API_KEY'],
              },
            ],
          },
        }),
      },
    } as any;
    const mockServer = { close: mock() } as any;

    const orchestrator = await OpencodeOrchestrator.initialize(undefined, mockClient, mockServer);
    const status = await orchestrator.getAuthStatus();

    expect(status.authenticated).toBe(false);
    expect(status.connected).toEqual([]);
  });

  it('times out and aborts if prompt takes too long', async () => {
    const abortMock = mock().mockResolvedValue({});

    const promptMock = mock().mockImplementation(() => {
      return new Promise((_resolve) => {
        // Never resolves to simulate a hung provider
      });
    });

    const mockClient = {
      provider: {
        list: mock().mockResolvedValue({
          data: {
            default: { model: 'anthropic/claude' },
            connected: ['anthropic'],
            all: [],
          },
        }),
      },
      session: {
        create: mock().mockResolvedValue({ data: { id: 'test-session' } }),
        prompt: promptMock,
        abort: abortMock,
      },
      event: {
        subscribe: mock().mockResolvedValue({ stream: [] }),
      },
    } as any;
    const mockServer = { close: mock() } as any;

    const orchestrator = await OpencodeOrchestrator.initialize(undefined, mockClient, mockServer);

    const task = {
      id: '1',
      description: 'Test task',
      goal: 'Do nothing',
      category: 'test' as const,
      systemPrompt: 'You are helpful',
      expectedOutputs: [],
      writeAllowlist: [],
      verification: [],
      maxCost: 1,
      timeout: 0.1, // 100ms timeout for test
    };

    const result = await orchestrator.executeTask(task);

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/Task timed out/);
    expect(abortMock).toHaveBeenCalledWith({ path: { id: 'test-session' } });
  });
});
