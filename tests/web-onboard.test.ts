import { describe, it, expect } from 'bun:test';
import { startWebOnboarding } from '../src/auth/web-onboard.js';

function makeStubAuth() {
  return {
    setApiKey: async (provider: string, key: string) => {
      if (key === 'valid-key') return { ok: true };
      return { ok: false, error: 'Invalid key' };
    },
  } as any;
}

const stubCatalog = {
  providers: [
    {
      id: 'anthropic',
      name: 'Anthropic',
      envVars: ['ANTHROPIC_API_KEY'],
      authMethods: [{ index: 0, type: 'api' as const, label: 'API Key' }],
      connected: false,
      envSatisfied: false,
      models: [],
      docsUrl: 'https://console.anthropic.com/settings/keys',
    },
  ],
  defaults: {},
  connected: [],
};

describe('web-onboard', () => {
  it('returns 404 for a request without the token', async () => {
    const handle = await startWebOnboarding(makeStubAuth(), stubCatalog, { ttlMs: 5000 });
    const res = await fetch(`http://127.0.0.1:${handle.port}/`);
    expect(res.status).toBe(404);
    handle.stop();
  });

  it('returns 404 for a token of the wrong length', async () => {
    const handle = await startWebOnboarding(makeStubAuth(), stubCatalog, { ttlMs: 5000 });
    const res = await fetch(`http://127.0.0.1:${handle.port}/wrongtoken/`);
    expect(res.status).toBe(404);
    handle.stop();
  });

  it('serves the onboarding page for the correct token', async () => {
    const handle = await startWebOnboarding(makeStubAuth(), stubCatalog, { ttlMs: 5000 });
    const res = await fetch(handle.url);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('LoopCode — connect a provider');
    expect(html).toContain('Anthropic');
    handle.stop();
  });

  it('submitting a key forwards to setApiKey and completes onboarding', async () => {
    const handle = await startWebOnboarding(makeStubAuth(), stubCatalog, { ttlMs: 5000 });
    const token = new URL(handle.url).pathname.split('/')[1];

    const res = await fetch(`http://127.0.0.1:${handle.port}/${token}/key`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'anthropic', key: 'valid-key' }),
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.ok).toBe(true);

    const done = await handle.done;
    expect(done.providerId).toBe('anthropic');

    handle.stop();
  });
});
