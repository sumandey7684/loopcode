import type { OpencodeClient } from '@opencode-ai/sdk';
import { logger } from '../app/logger.js';

export interface ModelInfo {
  id: string;
  name: string;
  contextWindow: number;
  maxOutput: number;
  inputCostPerMillion?: number;
  outputCostPerMillion?: number;
  supportsTools: boolean;
  supportsReasoning: boolean;
  status?: string;
}

export interface ProviderInfo {
  id: string;
  name: string;
  /** Env vars that would authenticate this provider without interactive login. */
  envVars: string[];
  /** Auth methods in SDK order; index is the `method` argument. */
  authMethods: Array<{ index: number; type: 'oauth' | 'api'; label: string }>;
  connected: boolean;
  /** True when an env var is already present in the environment. */
  envSatisfied: boolean;
  models: ModelInfo[];
  docsUrl?: string;
}

export interface Catalog {
  providers: ProviderInfo[];
  defaults: Record<string, string>;
  connected: string[];
}

/** Console URLs for the providers users actually reach for first. */
const KEY_URLS: Record<string, string> = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
  google: 'https://aistudio.google.com/apikey',
  openrouter: 'https://openrouter.ai/keys',
  deepseek: 'https://platform.deepseek.com/api_keys',
  groq: 'https://console.groq.com/keys',
  mistral: 'https://console.mistral.ai/api-keys',
  xai: 'https://console.x.ai',
};

function toModel(raw: {
  id: string;
  name: string;
  limit: { context: number; output: number };
  cost?: { input: number; output: number };
  tool_call: boolean;
  reasoning: boolean;
  status?: string;
}): ModelInfo {
  return {
    id: raw.id,
    name: raw.name || raw.id,
    contextWindow: raw.limit?.context ?? 0,
    maxOutput: raw.limit?.output ?? 0,
    inputCostPerMillion: raw.cost?.input,
    outputCostPerMillion: raw.cost?.output,
    supportsTools: Boolean(raw.tool_call),
    supportsReasoning: Boolean(raw.reasoning),
    status: raw.status,
  };
}

/**
 * Build the provider/model catalogue purely from live SDK data.
 * No hardcoded model lists — that was audit finding C11.
 */
export async function loadCatalog(client: OpencodeClient): Promise<Catalog> {
  const [listRes, authRes] = await Promise.all([client.provider.list(), client.provider.auth()]);

  const list = listRes.data;
  const authMap = authRes.data ?? {};

  if (!list) {
    logger.warn('auth', 'Could not list providers from OpenCode.');
    return { providers: [], defaults: {}, connected: [] };
  }

  const connected = new Set(list.connected ?? []);

  const providers: ProviderInfo[] = (list.all ?? []).map((p) => {
    const methods = (authMap[p.id] ?? []).map((m, index) => ({
      index,
      type: m.type,
      label: m.label,
    }));

    const envVars = p.env ?? [];

    return {
      id: p.id,
      name: p.name || p.id,
      envVars,
      authMethods: methods,
      connected: connected.has(p.id),
      envSatisfied: envVars.some((v) => Boolean(process.env[v])),
      models: Object.values(p.models ?? {}).map((m) => toModel(m as any)),
      docsUrl: KEY_URLS[p.id],
    };
  });

  // Rank: already usable first, then those with a known auth path, then the rest.
  providers.sort((a, b) => {
    const score = (x: ProviderInfo) => (x.connected ? 0 : x.envSatisfied ? 1 : x.authMethods.length > 0 ? 2 : 3);
    const diff = score(a) - score(b);
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  });

  return { providers, defaults: list.default ?? {}, connected: [...connected] };
}

export function isAuthenticated(catalog: Catalog): boolean {
  return catalog.providers.some((p) => p.connected || p.envSatisfied);
}

export function findProvider(catalog: Catalog, id: string): ProviderInfo | undefined {
  return catalog.providers.find((p) => p.id === id);
}

export function filterProviders(catalog: Catalog, query: string): ProviderInfo[] {
  const q = query.trim().toLowerCase();
  if (!q) return catalog.providers;
  return catalog.providers.filter((p) => p.id.toLowerCase().includes(q) || p.name.toLowerCase().includes(q));
}
