import * as fs from 'node:fs';
import * as path from 'node:path';
import { homedir } from 'node:os';
import type { OpencodeClient } from '@opencode-ai/sdk';
import { ANTIGRAVITY_MODELS } from './antigravity.js';
import { configStore } from '../config/store.js';
import { logger } from '../app/logger.js';

export interface RegistrationResult {
  ok: boolean;
  via: 'sdk' | 'file';
  error?: string;
}

/**
 * Register the local proxy as an OpenCode provider.
 *
 * Two steps:
 *  1. config.update() adds a provider entry with an Anthropic-compatible npm
 *     package and a loopback baseURL plus the model catalogue.
 *     If SDK config update fails/throws, fall back to atomic JSON merge in ~/.config/opencode/opencode.json.
 *  2. auth.set() stores a placeholder API key, because the proxy accepts any
 *     token but OpenCode still requires a credential to consider the provider
 *     usable.
 */
export async function registerAntigravityProvider(client: OpencodeClient): Promise<RegistrationResult> {
  const cfg = configStore.get().proxy;
  const providerId = cfg.providerId;
  const baseURL = `http://127.0.0.1:${cfg.port}`;

  const models: Record<string, unknown> = {};
  for (const model of ANTIGRAVITY_MODELS) {
    models[model.id] = {
      name: model.name,
      limit: { context: model.context, output: model.output },
      cost: { input: 0, output: 0 },
      modalities: { input: ['text', 'image', 'pdf'], output: ['text'] },
    };
  }

  let via: 'sdk' | 'file' = 'sdk';

  try {
    const { error: configError } = await client.config.update({
      body: {
        provider: {
          [providerId]: {
            npm: '@ai-sdk/anthropic',
            name: 'Antigravity (proxy)',
            options: { baseURL },
            models,
          },
        },
      } as never,
    });

    if (configError) {
      via = 'file';
      const fileOk = writeOpencodeJsonFallback(providerId, baseURL, models);
      if (!fileOk) {
        return {
          ok: false,
          via,
          error: `config.update failed: ${JSON.stringify(configError)} and file fallback failed`,
        };
      }
    }
  } catch {
    via = 'file';
    const fileOk = writeOpencodeJsonFallback(providerId, baseURL, models);
    if (!fileOk) {
      return { ok: false, via, error: 'SDK config update threw and file fallback failed' };
    }
  }

  try {
    const { error: authError } = await client.auth.set({
      path: { id: providerId },
      body: { type: 'api', key: 'loopcode-antigravity-proxy' },
    });

    if (authError) {
      return { ok: false, via, error: `auth.set failed: ${JSON.stringify(authError)}` };
    }

    logger.info('proxy', `Registered provider "${providerId}" at ${baseURL} via ${via}.`);
    return { ok: true, via };
  } catch (err) {
    return { ok: false, via, error: (err as Error).message };
  }
}

function writeOpencodeJsonFallback(providerId: string, baseURL: string, models: Record<string, unknown>): boolean {
  try {
    const configDir = path.join(homedir(), '.config', 'opencode');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    const filePath = path.join(configDir, 'opencode.json');
    let existing: Record<string, any> = {};

    if (fs.existsSync(filePath)) {
      try {
        existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      } catch {
        existing = {};
      }
    }

    existing.$schema = existing.$schema || 'https://opencode.ai/config.json';
    existing.provider = existing.provider || {};
    existing.provider[providerId] = {
      npm: '@ai-sdk/anthropic',
      name: 'Antigravity (proxy)',
      options: { baseURL },
      models,
    };

    const tmpPath = `${filePath}.tmp.${Date.now()}`;
    fs.writeFileSync(tmpPath, JSON.stringify(existing, null, 2), 'utf-8');
    fs.renameSync(tmpPath, filePath);
    logger.info('proxy', `Merged provider block into ${filePath}`);
    return true;
  } catch (err) {
    logger.error('proxy', `Failed writing opencode.json fallback: ${(err as Error).message}`);
    return false;
  }
}

/**
 * Verify the registration actually took: the provider must appear connected
 * and expose at least one model.
 */
export async function verifyRegistration(client: OpencodeClient): Promise<boolean> {
  const providerId = configStore.get().proxy.providerId;
  try {
    const { data } = await client.provider.list();
    const entry = (data?.all ?? []).find((p) => p.id === providerId);
    const connected = (data?.connected ?? []).includes(providerId);
    return Boolean(entry && Object.keys(entry.models ?? {}).length > 0 && connected);
  } catch {
    return false;
  }
}
