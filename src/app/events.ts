/**
 * The single typed contract between the engine and any UI.
 *
 * Everything the orchestrator wants to tell a human becomes one of these.
 * Nothing in src/app or src/cli may use console.* for user-facing output.
 */

export type TranscriptRole = 'user' | 'assistant' | 'system';

export interface BaseEvent {
  /** Monotonic id, unique per process. */
  id: string;
  /** Epoch millis. */
  at: number;
}

export interface UserPromptEvent extends BaseEvent {
  kind: 'user-prompt';
  text: string;
}

export interface AssistantTextEvent extends BaseEvent {
  kind: 'assistant-text';
  text: string;
  /** True while the model is still streaming this block. */
  streaming?: boolean;
}

export interface ThinkingEvent extends BaseEvent {
  kind: 'thinking';
  text: string;
}

export interface PhaseEvent extends BaseEvent {
  kind: 'phase';
  phase: 'planning' | 'executing' | 'verifying' | 'done' | 'failed';
  detail?: string;
}

export interface PlanEvent extends BaseEvent {
  kind: 'plan';
  batches: Array<Array<{ id: string; description: string; writeAllowlist: string[] }>>;
  replanned: boolean;
}

export interface TaskStateEvent extends BaseEvent {
  kind: 'task-state';
  taskId: string;
  title: string;
  batchIndex: number;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'retrying' | 'skipped';
  model?: string;
  costUsd?: number;
  durationMs?: number;
  attempt?: number;
}

export interface ToolEvent extends BaseEvent {
  kind: 'tool';
  tool: string;
  summary: string;
  detail?: string;
  status: 'running' | 'ok' | 'error';
  durationMs?: number;
}

export interface DiffEvent extends BaseEvent {
  kind: 'diff';
  path: string;
  added: number;
  removed: number;
  patch: string;
}

export interface VerificationEvent extends BaseEvent {
  kind: 'verification';
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

export interface CostEvent extends BaseEvent {
  kind: 'cost';
  taskUsd?: number;
  goalUsd: number;
  goalLimitUsd: number;
  monthUsd?: number;
  monthLimitUsd?: number;
  /** Set when the active provider is quota-based (proxy) rather than metered. */
  quota?: { used: number; limit: number; resetsAt?: string };
}

export interface ApprovalRequestEvent extends BaseEvent {
  kind: 'approval-request';
  requestId: string;
  what: 'shell' | 'edit';
  command?: string;
  path?: string;
  patch?: string;
  destructive: boolean;
}

export interface EscalationEvent extends BaseEvent {
  kind: 'escalation';
  requestId: string;
  reason: string;
  options: Array<{ id: string; label: string }>;
}

export interface NoticeEvent extends BaseEvent {
  kind: 'notice';
  level: 'info' | 'warn' | 'error' | 'success';
  text: string;
  /** Transient toast vs permanent transcript entry. */
  ephemeral?: boolean;
}

export interface AuthStateEvent extends BaseEvent {
  kind: 'auth-state';
  connected: string[];
  defaults: Record<string, string>;
  activeModel?: { providerID: string; modelID: string };
}

export interface ProxyStateEvent extends BaseEvent {
  kind: 'proxy-state';
  running: boolean;
  port?: number;
  version?: string;
  accounts?: number;
  healthy?: boolean;
  message?: string;
}

export type AppEvent =
  | UserPromptEvent
  | AssistantTextEvent
  | ThinkingEvent
  | PhaseEvent
  | PlanEvent
  | TaskStateEvent
  | ToolEvent
  | DiffEvent
  | VerificationEvent
  | CostEvent
  | ApprovalRequestEvent
  | EscalationEvent
  | NoticeEvent
  | AuthStateEvent
  | ProxyStateEvent;

export type AppEventKind = AppEvent['kind'];

import { redact } from './redact.js';

/** Fields that may contain model or command output. */
const TEXTUAL_FIELDS = ['text', 'summary', 'detail', 'patch', 'evidence', 'message', 'retryHint', 'command'] as const;

function scrub(event: AppEvent): AppEvent {
  const clone: Record<string, unknown> = { ...(event as object) };
  for (const field of TEXTUAL_FIELDS) {
    if (typeof clone[field] === 'string') clone[field] = redact(clone[field] as string);
  }
  if (Array.isArray(clone.layers)) {
    clone.layers = (clone.layers as Array<Record<string, unknown>>).map((l) =>
      typeof l.evidence === 'string' ? { ...l, evidence: redact(l.evidence) } : l,
    );
  }
  return clone as unknown as AppEvent;
}

export type Handler = (event: AppEvent) => void;

let seq = 0;

/** Stamp id/at so emitters only supply payload. */
export function makeEvent<E extends AppEvent>(input: Omit<E, 'id' | 'at'>): E {
  seq += 1;
  return { ...(input as object), id: `e${seq}`, at: Date.now() } as E;
}

/**
 * Minimal synchronous pub/sub. Deliberately not an EventEmitter:
 * we want a typed surface and no listener-limit warnings.
 */
export class EventBus {
  private handlers = new Set<Handler>();
  private buffer: AppEvent[] = [];
  private maxBuffer: number;

  constructor(maxBuffer = 5000) {
    this.maxBuffer = maxBuffer;
  }

  subscribe(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  emit(event: AppEvent): void {
    const safe = scrub(event);
    this.buffer.push(safe);
    if (this.buffer.length > this.maxBuffer) {
      this.buffer.splice(0, this.buffer.length - this.maxBuffer);
    }
    for (const handler of this.handlers) {
      try {
        handler(safe);
      } catch {
        // A broken subscriber must never break the engine.
      }
    }
  }

  /** Replay for late subscribers (e.g. UI mounted after startup). */
  history(): readonly AppEvent[] {
    return this.buffer;
  }

  clear(): void {
    this.buffer = [];
  }
}
