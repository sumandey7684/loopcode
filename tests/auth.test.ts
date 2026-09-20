import { describe, it, expect } from 'bun:test';
import { loadCatalog, isAuthenticated, findProvider, filterProviders } from '../src/auth/provider-catalog.js';
import { AuthService } from '../src/auth/auth-service.js';

function makeStubClient(options?: {
  providers?: any[];
  connected?: string[];
  defaults?: Record<string, string>;
  authMap?: Record<string, any[]>;
  setAuthResult?: { data?: boolean; error?: any };
  oauthAuthorizeResult?: { data?: any; error?: any };
  oauthCallbackResult?: { data?: boolean; error?: any };
}) {
  return {
    provider: {
      list: async () => ({
        data: {
          all: options?.providers ?? [
            {
              id: 'anthropic',
              name: 'Anthropic',
              env: ['ANTHROPIC_API_KEY'],
              models: {
                'claude-sonnet-4-6': {
                  id: 'claude-sonnet-4-6',
                  name: 'Claude Sonnet 4.6',
                  limit: { context: 200000, output: 8192 },
                  cost: { input: 3, output: 15 },
                  tool_call: true,
                  reasoning: true,
                },
              },
            },
          ],
          default: options?.defaults ?? { default: 'anthropic/claude-sonnet-4-6' },
          connected: options?.connected ?? ['anthropic'],
        },
      }),
      auth: async () => ({
        data: options?.authMap ?? {
          anthropic: [
            { type: 'api', label: 'API Key' },
            { type: 'oauth', label: 'OAuth' },
          ],
        },
      }),
      oauth: {
        authorize: async () =>
          options?.oauthAuthorizeResult ?? {
            data: { url: 'https://auth.example.com', method: 'auto', instructions: 'Follow instructions' },
          },
        callback: async () => options?.oauthCallbackResult ?? { data: true },
      },
    },
    auth: {
      set: async () => options?.setAuthResult ?? { data: true },
    },
  } as any;
}

describe('provider catalog', () => {
  it('loadCatalog merges provider.list() and provider.auth(), preserving method index order', async () => {
    const client = makeStubClient();
    const catalog = await loadCatalog(client);
    expect(catalog.providers.length).toBeGreaterThan(0);

    const anthropic = catalog.providers.find((p) => p.id === 'anthropic');
    expect(anthropic).toBeDefined();
    expect(anthropic?.authMethods.length).toBe(2);
    expect(anthropic?.authMethods[0]).toEqual({ index: 0, type: 'api', label: 'API Key' });
    expect(anthropic?.authMethods[1]).toEqual({ index: 1, type: 'oauth', label: 'OAuth' });
  });

  it('loadCatalog marks connected from list().connected and envSatisfied from process.env', async () => {
    const client = makeStubClient({ connected: ['anthropic'] });
    const catalog = await loadCatalog(client);
    expect(catalog.connected).toContain('anthropic');
    expect(isAuthenticated(catalog)).toBe(true);
  });

  it('findProvider and filterProviders', async () => {
    const client = makeStubClient();
    const catalog = await loadCatalog(client);
    expect(findProvider(catalog, 'anthropic')).toBeDefined();
    expect(filterProviders(catalog, 'anth')).toHaveLength(1);
    expect(filterProviders(catalog, 'nonexistent')).toHaveLength(0);
  });
});

describe('AuthService', () => {
  it('setApiKey rejects empty, short, and whitespace-containing keys without calling SDK', async () => {
    const client = makeStubClient();
    const service = new AuthService(client);

    expect(await service.setApiKey('anthropic', '')).toEqual({ ok: false, error: 'The key is empty.' });
    expect(await service.setApiKey('anthropic', 'short')).toEqual({ ok: false, error: 'That key looks too short.' });
    expect(await service.setApiKey('anthropic', 'key with space inside')).toEqual({
      ok: false,
      error: 'The key contains whitespace.',
    });
  });

  it('setApiKey calls client.auth.set with {type:"api", key}', async () => {
    let calledPath: any;
    let calledBody: any;
    const client = makeStubClient();
    client.auth.set = async ({ path, body }: any) => {
      calledPath = path;
      calledBody = body;
      return { data: true };
    };

    const service = new AuthService(client);
    const res = await service.setApiKey('anthropic', 'sk-ant-validkey123456');

    expect(calledPath).toEqual({ id: 'anthropic' });
    expect(calledBody).toEqual({ type: 'api', key: 'sk-ant-validkey123456' });
    expect(res.ok).toBe(true);
  });

  it('setApiKey returns ok:false with a message when SDK returns error', async () => {
    const client = makeStubClient({ setAuthResult: { error: { message: 'Invalid API Key' } } });
    const service = new AuthService(client);
    const res = await service.setApiKey('anthropic', 'sk-ant-invalidkey123456');

    expect(res.ok).toBe(false);
    expect(res.error).toBe('Invalid API Key');
  });

  it('startOAuth forwards the exact method index and returns mode from SDK response', async () => {
    let methodPassed: number | undefined;
    const client = makeStubClient();
    client.provider.oauth.authorize = async ({ body }: any) => {
      methodPassed = body.method;
      return { data: { url: 'https://auth.example.com', method: 'code', instructions: 'Paste code' } };
    };

    const service = new AuthService(client);
    const session = await service.startOAuth('anthropic', 1);

    expect(methodPassed).toBe(1);
    expect(session.mode).toBe('code');
    expect(session.url).toBe('https://auth.example.com');
  });

  it('completeOAuth sends the trimmed code', async () => {
    let codePassed: string | undefined;
    const client = makeStubClient();
    client.provider.oauth.callback = async ({ body }: any) => {
      codePassed = body.code;
      return { data: true };
    };

    const service = new AuthService(client);
    const session = {
      providerId: 'anthropic',
      methodIndex: 1,
      url: 'https://auth.example.com',
      mode: 'code' as const,
      instructions: '',
      browserOpened: false,
      cancel: () => {},
    };

    const res = await service.completeOAuth(session, '  code-12345  ');
    expect(codePassed).toBe('code-12345');
    expect(res.ok).toBe(true);
  });
});
