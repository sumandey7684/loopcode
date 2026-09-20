import { describe, it, expect, beforeEach } from 'bun:test';
import { hasAcceptedRisk, acceptRisk, revokeRisk, ANTIGRAVITY_RISK_TEXT } from '../src/proxy/consent.js';
import { AntigravityProxy } from '../src/proxy/antigravity.js';
import { registerAntigravityProvider, verifyRegistration } from '../src/proxy/registration.js';
import { configStore } from '../src/config/store.js';

describe('Antigravity proxy consent', () => {
  beforeEach(() => {
    revokeRisk();
  });

  it('riskAcceptedAt is empty by default and hasAcceptedRisk returns false', () => {
    expect(hasAcceptedRisk()).toBe(false);
  });

  it('acceptRisk writes ISO timestamp to configStore', () => {
    acceptRisk();
    expect(hasAcceptedRisk()).toBe(true);
    expect(configStore.get().proxy.riskAcceptedAt).toBeTruthy();
  });

  it('revokeRisk resets timestamp and disables proxy', () => {
    acceptRisk();
    expect(hasAcceptedRisk()).toBe(true);
    revokeRisk();
    expect(hasAcceptedRisk()).toBe(false);
    expect(configStore.get().proxy.enabled).toBe(false);
  });

  it('risk text contains prominent ToS and ban warning', () => {
    expect(ANTIGRAVITY_RISK_TEXT).toContain('Terms of Service');
    expect(ANTIGRAVITY_RISK_TEXT).toContain('Google account may be permanently banned');
  });
});

describe('AntigravityProxy', () => {
  it('detectInstalled does not throw and returns installHint string', () => {
    const proxy = new AntigravityProxy();
    const hint = proxy.installHint();
    expect(hint).toContain('npm install -g antigravity-claude-proxy');

    const detection = proxy.detectInstalled();
    expect(typeof detection.installed).toBe('boolean');
  });

  it('health check on unused port returns running: false', async () => {
    const proxy = new AntigravityProxy();
    const health = await proxy.health(100);
    expect(health.running).toBe(false);
    expect(health.healthy).toBe(false);
  });

  it('stop on unowned proxy does not throw', async () => {
    const proxy = new AntigravityProxy();
    await expect(proxy.stop()).resolves.toBeUndefined();
  });
});

describe('registerAntigravityProvider', () => {
  it('falls back to writing ~/.config/opencode/opencode.json if SDK throws or fails', async () => {
    const mockClient = {
      config: {
        update: async () => {
          throw new Error('SDK update unsupported');
        },
      },
      auth: {
        set: async () => ({ data: true }),
      },
    } as any;

    const res = await registerAntigravityProvider(mockClient);
    expect(res.ok).toBe(true);
    expect(res.via).toBe('file');
  });

  it('verifyRegistration returns true when provider is connected with models', async () => {
    const mockClient = {
      provider: {
        list: async () => ({
          data: {
            all: [
              {
                id: 'antigravity',
                models: { 'claude-sonnet-4-6': { id: 'claude-sonnet-4-6' } },
              },
            ],
            connected: ['antigravity'],
          },
        }),
      },
    } as any;

    const isVerified = await verifyRegistration(mockClient);
    expect(isVerified).toBe(true);
  });
});
