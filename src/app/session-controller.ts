import type { OpencodeClient } from '@opencode-ai/sdk';
import { EventBus } from './events.js';
import type { LoopcodeConfig } from '../config/schema.js';
import type { Catalog, ProviderInfo } from '../auth/provider-catalog.js';
import type { OAuthSession } from '../auth/auth-service.js';
import type { SessionRecord } from '../memory.js';

export interface TaskSnapshot {
  id: string;
  title: string;
  batchIndex: number;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'retrying' | 'skipped';
  model?: string;
  costUsd?: number;
  durationMs?: number;
  attempt?: number;
}

export interface VerificationSnapshot {
  taskId: string;
  layers: Array<{
    name: string;
    type: 'compile' | 'lint' | 'test' | 'security' | 'review';
    status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped';
    durationMs?: number;
    evidence?: string;
  }>;
  overallPass: boolean | null;
  retryHint?: string;
}

export interface Snapshot {
  phase: 'idle' | 'planning' | 'executing' | 'verifying' | 'done' | 'failed';
  detail?: string;
  startedAt?: number;
  projectName: string;
  gitBranch: string;
  activeModel?: string;
  permissionMode: 'plan' | 'acceptEdits' | 'auto';
  goalSpentUsd: number;
  goalLimitUsd: number;
  monthSpentUsd: number;
  monthLimitUsd: number;
  quota: { used: number; limit: number; resetsAt?: string } | null;
  tasks: TaskSnapshot[];
  verifications: VerificationSnapshot[];
  sessions: SessionRecord[];
  proxy: { running: boolean; healthy: boolean; port?: number; accounts?: number; message?: string };
}

export interface SessionController {
  readonly bus: EventBus;
  readonly client: OpencodeClient;
  readonly config: LoopcodeConfig;

  snapshot(): Snapshot;

  // ── lifecycle ──────────────────────────────────────────────────────────
  runGoal(goal: string): Promise<void>;
  resume(taskId: string): Promise<void>;
  interrupt(): Promise<void>;
  shutdown(): Promise<void>;

  // ── commands ───────────────────────────────────────────────────────────
  runCommand(input: string, hooks: { openOverlay: (name: string) => void }): Promise<void>;

  // ── auth ───────────────────────────────────────────────────────────────
  refreshCatalog(): Promise<Catalog>;
  catalog(): Catalog | null;
  findProvider(id: string): ProviderInfo | undefined;
  setApiKey(providerId: string, key: string): Promise<{ ok: boolean; error?: string }>;
  startOAuth(providerId: string, methodIndex: number): Promise<OAuthSession>;
  awaitOAuth(
    session: OAuthSession,
    options?: { onTick?: (ms: number) => void; signal?: AbortSignal },
  ): Promise<{ ok: boolean; error?: string }>;
  completeOAuth(session: OAuthSession, code: string): Promise<{ ok: boolean; error?: string }>;
  startWebOnboarding(): Promise<{ url: string; stop: () => void }>;

  // ── models ─────────────────────────────────────────────────────────────
  setModelForRole(role: string, providerID: string, modelID: string): void;

  // ── proxy ──────────────────────────────────────────────────────────────
  enableProxy(): Promise<{ ok: boolean; error?: string; needsConsent?: boolean; needsInstall?: boolean }>;
  disableProxy(): Promise<void>;
  proxyStatus(): Promise<Snapshot['proxy']>;
  acceptProxyRisk(): void;

  // ── trust ──────────────────────────────────────────────────────────────
  trustDirectory(scope: 'session' | 'permanent'): void;
  isDirectoryTrusted(): boolean;

  // ── sessions ───────────────────────────────────────────────────────────
  renameSession(id: string, name: string): void;
  deleteSession(id: string): void;

  // ── modes / approvals ──────────────────────────────────────────────────
  cyclePermissionMode(): void;
  resolveApproval(requestId: string, decision: 'yes' | 'always' | 'no'): void;
  resolveEscalation(requestId: string, optionId: string, guidance?: string): void;
}
