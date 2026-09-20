import type { OpencodeClient } from '@opencode-ai/sdk';
import { loadCatalog, type Catalog, type ProviderInfo } from './provider-catalog.js';
import type { Listener } from './oauth-listener.js';
import { openBrowser } from './browser.js';
import { logger } from '../app/logger.js';
import { EventBus, makeEvent, type AuthStateEvent } from '../app/events.js';

export interface ApiKeyResult {
  ok: boolean;
  error?: string;
}

export interface OAuthSession {
  providerId: string;
  methodIndex: number;
  /** URL the user must visit. */
  url: string;
  /** 'auto' → we poll; 'code' → user pastes a code. */
  mode: 'auto' | 'code';
  instructions: string;
  browserOpened: boolean;
  listener?: Listener;
  cancel: () => void;
}

export class AuthService {
  private client: OpencodeClient;
  private bus?: EventBus;
  private catalog: Catalog | null = null;

  constructor(client: OpencodeClient, bus?: EventBus) {
    this.client = client;
    this.bus = bus;
  }

  async refresh(): Promise<Catalog> {
    this.catalog = await loadCatalog(this.client);
    this.bus?.emit(
      makeEvent<AuthStateEvent>({
        kind: 'auth-state',
        connected: this.catalog.connected,
        defaults: this.catalog.defaults,
      }),
    );
    return this.catalog;
  }

  current(): Catalog | null {
    return this.catalog;
  }

  /**
   * Store an API key for a provider.
   * The key is handed to OpenCode's credential store and never persisted by us.
   */
  async setApiKey(providerId: string, key: string): Promise<ApiKeyResult> {
    const trimmed = key.trim();
    if (!trimmed) return { ok: false, error: 'The key is empty.' };
    if (trimmed.length < 8) return { ok: false, error: 'That key looks too short.' };
    if (/\s/.test(trimmed)) return { ok: false, error: 'The key contains whitespace.' };

    try {
      const { data, error } = await this.client.auth.set({
        path: { id: providerId },
        body: { type: 'api', key: trimmed },
      });

      if (error || data === false) {
        return { ok: false, error: describeError(error) ?? 'OpenCode rejected the credential.' };
      }

      await this.refresh();
      const provider = this.catalog?.providers.find((p) => p.id === providerId);
      if (!provider?.connected) {
        // Stored but not reported connected: usually an invalid key.
        return {
          ok: false,
          error: 'Saved, but the provider still reports as not connected. The key may be invalid.',
        };
      }

      logger.info('auth', `Stored API credential for ${providerId}.`);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  /**
   * Begin an OAuth flow. Does not block: the caller drives the UI and then
   * calls completeOAuth (code mode) or awaitOAuth (auto mode).
   */
  async startOAuth(providerId: string, methodIndex: number): Promise<OAuthSession> {
    const { data, error } = await this.client.provider.oauth.authorize({
      path: { id: providerId },
      body: { method: methodIndex },
    });

    if (error || !data) {
      throw new Error(describeError(error) ?? `Could not start OAuth for ${providerId}.`);
    }

    const listener: Listener | undefined = undefined;

    const browserOpened = openBrowser(data.url);

    return {
      providerId,
      methodIndex,
      url: data.url,
      mode: data.method,
      instructions: data.instructions,
      browserOpened,
      listener,
      cancel: () => (listener as Listener | undefined)?.close(),
    };
  }

  /**
   * Auto mode: poll the callback endpoint until OpenCode reports success.
   * `onTick` lets the UI show elapsed seconds.
   */
  async awaitOAuth(
    session: OAuthSession,
    options?: { timeoutMs?: number; intervalMs?: number; onTick?: (elapsedMs: number) => void; signal?: AbortSignal },
  ): Promise<{ ok: boolean; error?: string }> {
    const timeoutMs = options?.timeoutMs ?? 300_000;
    const intervalMs = options?.intervalMs ?? 1500;
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      if (options?.signal?.aborted) {
        session.cancel();
        return { ok: false, error: 'Cancelled.' };
      }

      options?.onTick?.(Date.now() - started);

      try {
        const { data, error } = await this.client.provider.oauth.callback({
          path: { id: session.providerId },
          body: { method: session.methodIndex },
        });

        if (data === true) {
          session.cancel();
          await this.refresh();
          logger.info('auth', `OAuth completed for ${session.providerId}.`);
          return { ok: true };
        }

        // A hard 400 means the flow is unusable, not merely pending.
        const message = describeError(error);
        if (message && !/pending|not ?ready|no ?code|waiting/i.test(message)) {
          session.cancel();
          return { ok: false, error: message };
        }
      } catch (err) {
        logger.debug('auth', `OAuth poll error: ${(err as Error).message}`);
      }

      await sleep(intervalMs);
    }

    session.cancel();
    return { ok: false, error: 'Timed out waiting for authorization.' };
  }

  /** Code mode: submit the pasted authorization code. */
  async completeOAuth(session: OAuthSession, code: string): Promise<{ ok: boolean; error?: string }> {
    const trimmed = code.trim();
    if (!trimmed) return { ok: false, error: 'No code entered.' };

    try {
      const { data, error } = await this.client.provider.oauth.callback({
        path: { id: session.providerId },
        body: { method: session.methodIndex, code: trimmed },
      });

      if (error || data !== true) {
        return { ok: false, error: describeError(error) ?? 'The code was rejected.' };
      }

      session.cancel();
      await this.refresh();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  /** Providers that can be authenticated without any interactive step. */
  envReadyProviders(): ProviderInfo[] {
    return (this.catalog?.providers ?? []).filter((p) => p.envSatisfied && !p.connected);
  }
}

function describeError(error: unknown): string | undefined {
  if (!error) return undefined;
  if (typeof error === 'string') return error;
  const record = error as { data?: { message?: string }; message?: string };
  return record.data?.message ?? record.message ?? JSON.stringify(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
