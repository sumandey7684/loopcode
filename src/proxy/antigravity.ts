import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { logger } from '../app/logger.js';
import { EventBus, makeEvent, type ProxyStateEvent } from '../app/events.js';
import { configStore } from '../config/store.js';

export interface ProxyHealth {
  running: boolean;
  healthy: boolean;
  port: number;
  version?: string;
  accounts?: number;
  message?: string;
}

export interface QuotaInfo {
  accounts: Array<{
    email?: string;
    used?: number;
    limit?: number;
    resetsAt?: string;
    rateLimited?: boolean;
  }>;
}

/** Model catalogue exposed by the proxy's Anthropic-compatible surface. */
export const ANTIGRAVITY_MODELS = [
  { id: 'claude-opus-4-6-thinking', name: 'Claude Opus 4.6 (thinking)', context: 200_000, output: 64_000 },
  { id: 'claude-sonnet-4-6-thinking', name: 'Claude Sonnet 4.6 (thinking)', context: 200_000, output: 64_000 },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', context: 200_000, output: 64_000 },
  { id: 'gemini-3.1-pro-high', name: 'Gemini 3.1 Pro (high)', context: 1_048_576, output: 65_535 },
  { id: 'gemini-3.1-pro-low', name: 'Gemini 3.1 Pro (low)', context: 1_048_576, output: 65_535 },
  { id: 'gemini-3-flash', name: 'Gemini 3 Flash', context: 1_048_576, output: 65_536 },
] as const;

const PACKAGE = 'antigravity-claude-proxy';

export class AntigravityProxy {
  private bus?: EventBus;
  private child: ChildProcess | null = null;
  /** True when we started the process and are therefore responsible for stopping it. */
  private owned = false;

  constructor(bus?: EventBus) {
    this.bus = bus;
  }

  private get port(): number {
    return configStore.get().proxy.port;
  }

  private baseUrl(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  /** Is the CLI available without installing anything? */
  detectInstalled(): { installed: boolean; via: 'global' | 'npx' | 'none' } {
    const probe = spawnSync('acc', ['--version'], { stdio: 'ignore' });
    if (probe.status === 0) return { installed: true, via: 'global' };

    const probe2 = spawnSync(PACKAGE, ['--version'], { stdio: 'ignore' });
    if (probe2.status === 0) return { installed: true, via: 'global' };

    // npx can fetch on demand, but that is a network install we must not do silently.
    const hasNpx = spawnSync('npx', ['--version'], { stdio: 'ignore' }).status === 0;
    return { installed: false, via: hasNpx ? 'npx' : 'none' };
  }

  /** The command a user should run themselves; shown, never executed implicitly. */
  installHint(): string {
    return `npm install -g ${PACKAGE}@latest`;
  }

  async health(timeoutMs = 2000): Promise<ProxyHealth> {
    const port = this.port;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(`${this.baseUrl()}/health`, { signal: controller.signal });
      clearTimeout(timer);

      if (!res.ok) {
        return { running: true, healthy: false, port, message: `health returned ${res.status}` };
      }

      const body = (await res.json().catch(() => ({}))) as {
        version?: string;
        accounts?: number;
        status?: string;
      };

      return {
        running: true,
        healthy: true,
        port,
        version: body.version,
        accounts: body.accounts,
      };
    } catch (err) {
      const message = (err as Error).name === 'AbortError' ? 'health check timed out' : 'not reachable';
      return { running: false, healthy: false, port, message };
    }
  }

  async quota(): Promise<QuotaInfo | null> {
    try {
      const res = await fetch(`${this.baseUrl()}/account-limits`);
      if (!res.ok) return null;
      const body = (await res.json()) as QuotaInfo;
      return body;
    } catch {
      return null;
    }
  }

  /**
   * Start the proxy in the background if it is not already answering.
   * Returns the health state after startup settles.
   */
  async start(options?: { timeoutMs?: number }): Promise<ProxyHealth> {
    const existing = await this.health();
    if (existing.healthy) {
      this.emit(existing);
      return existing;
    }

    const detection = this.detectInstalled();
    if (!detection.installed) {
      const health: ProxyHealth = {
        running: false,
        healthy: false,
        port: this.port,
        message: `${PACKAGE} is not installed. Run: ${this.installHint()}`,
      };
      this.emit(health);
      return health;
    }

    const bin = spawnSync('acc', ['--version'], { stdio: 'ignore' }).status === 0 ? 'acc' : PACKAGE;

    logger.info('proxy', `Starting ${bin} on port ${this.port}.`);
    this.child = spawn(bin, ['start', '--log'], {
      env: { ...process.env, PORT: String(this.port) },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });
    this.owned = true;

    this.child.stdout?.on('data', (chunk: Buffer) => logger.debug('proxy', chunk.toString().trim()));
    this.child.stderr?.on('data', (chunk: Buffer) => logger.debug('proxy', chunk.toString().trim()));
    this.child.on('exit', (code) => {
      logger.info('proxy', `Proxy process exited with code ${code}.`);
      this.child = null;
      this.emit({ running: false, healthy: false, port: this.port, message: `exited (${code})` });
    });

    const deadline = Date.now() + (options?.timeoutMs ?? 20_000);
    while (Date.now() < deadline) {
      await sleep(600);
      const health = await this.health(1500);
      if (health.healthy) {
        this.emit(health);
        return health;
      }
      if (!this.child) break;
    }

    const failed: ProxyHealth = {
      running: Boolean(this.child),
      healthy: false,
      port: this.port,
      message: 'proxy did not become healthy in time',
    };
    this.emit(failed);
    return failed;
  }

  /** Only stops a process we started; never kills a user-managed daemon. */
  async stop(): Promise<void> {
    if (this.child && this.owned) {
      this.child.kill('SIGTERM');
      this.child = null;
      this.owned = false;
      this.emit({ running: false, healthy: false, port: this.port, message: 'stopped' });
      return;
    }
    logger.info('proxy', 'Proxy was not started by LoopCode; leaving it running.');
  }

  /** True when accounts are linked; otherwise the user must add one via the proxy UI. */
  async needsAccountLink(): Promise<boolean> {
    const health = await this.health();
    if (!health.healthy) return false;
    if (typeof health.accounts === 'number') return health.accounts === 0;
    const quota = await this.quota();
    return !quota || quota.accounts.length === 0;
  }

  dashboardUrl(): string {
    return this.baseUrl();
  }

  private emit(health: ProxyHealth): void {
    this.bus?.emit(
      makeEvent<ProxyStateEvent>({
        kind: 'proxy-state',
        running: health.running,
        healthy: health.healthy,
        port: health.port,
        version: health.version,
        accounts: health.accounts,
        message: health.message,
      }),
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
