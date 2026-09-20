import { z } from 'zod';

/**
 * Canonical LoopCode configuration.
 *
 * Precedence, highest first:
 *   1. CLI flags
 *   2. Environment variables (LOOPCODE_*)
 *   3. ~/.loopcode/config.toml
 *   4. Legacy ./config.toml  (deprecated; read-only)
 *   5. Defaults below
 */

export const ModelRouteString = z.string().regex(/^[a-z0-9_.-]+\/[A-Za-z0-9_.:-]+$/, 'expected "providerID/modelID"');

export const ModelConfigSchema = z
  .object({
    default: ModelRouteString.optional(),
    planning: ModelRouteString.optional(),
    execution: ModelRouteString.optional(),
    verification: ModelRouteString.optional(),
    review: ModelRouteString.optional(),
    research: ModelRouteString.optional(),
    quickFix: ModelRouteString.optional(),
  })
  .strict();

export const BudgetConfigSchema = z
  .object({
    /** Hard USD ceiling per calendar-rolling 30 days. */
    maxMonthlyCostUsd: z.number().positive().default(100),
    /** Hard USD ceiling for a single goal run. */
    maxGoalCostUsd: z.number().positive().default(10),
    /** Hard USD ceiling for a single task. */
    maxTaskCostUsd: z.number().positive().default(2),
    /** Warn in the UI at this fraction of any limit. */
    warnAtFraction: z.number().min(0).max(1).default(0.8),
  })
  .strict();

export const ProxyConfigSchema = z
  .object({
    /** Enable the Antigravity proxy provider path. */
    enabled: z.boolean().default(false),
    kind: z.literal('antigravity').default('antigravity'),
    /** Loopback port the proxy listens on. */
    port: z.number().int().min(1024).max(65535).default(8080),
    /** Start the proxy automatically when LoopCode starts. */
    autoStart: z.boolean().default(true),
    /** Provider id registered into OpenCode for proxy models. */
    providerId: z.string().default('antigravity'),
    /** ISO timestamp of explicit risk acknowledgement. Empty = not accepted. */
    riskAcceptedAt: z.string().default(''),
  })
  .strict();

export const UiConfigSchema = z
  .object({
    theme: z.enum(['auto', 'dark', 'light', 'mono']).default('auto'),
    /** Force ASCII glyphs. Also enabled by LOOPCODE_ASCII=1. */
    ascii: z.boolean().default(false),
    /** Show thinking blocks in the transcript. */
    showThinking: z.boolean().default(false),
    /** Lines kept in the in-memory transcript. */
    transcriptLimit: z.number().int().min(200).max(100000).default(5000),
  })
  .strict();

export const SafetyConfigSchema = z
  .object({
    permissionMode: z.enum(['plan', 'acceptEdits', 'auto']).default('acceptEdits'),
    /** Allow automatic `git reset --hard` on budget breach. Off by default. */
    allowDestructiveRollback: z.boolean().default(false),
    maxParallelAgents: z.number().int().min(1).max(32).default(5),
  })
  .strict();

export const ConfigSchema = z
  .object({
    model: ModelConfigSchema.default({}),
    budget: BudgetConfigSchema.default({
      maxMonthlyCostUsd: 100,
      maxGoalCostUsd: 10,
      maxTaskCostUsd: 2,
      warnAtFraction: 0.8,
    }),
    proxy: ProxyConfigSchema.default({
      enabled: false,
      kind: 'antigravity',
      port: 8080,
      autoStart: true,
      providerId: 'antigravity',
      riskAcceptedAt: '',
    }),
    ui: UiConfigSchema.default({
      theme: 'auto',
      ascii: false,
      showThinking: false,
      transcriptLimit: 5000,
    }),
    safety: SafetyConfigSchema.default({
      permissionMode: 'acceptEdits',
      allowDestructiveRollback: false,
      maxParallelAgents: 5,
    }),
  })
  .strict();

export type LoopcodeConfig = z.infer<typeof ConfigSchema>;
export type ModelConfig = z.infer<typeof ModelConfigSchema>;
export type BudgetConfig = z.infer<typeof BudgetConfigSchema>;
export type ProxyConfig = z.infer<typeof ProxyConfigSchema>;
export type UiConfig = z.infer<typeof UiConfigSchema>;
export type SafetyConfig = z.infer<typeof SafetyConfigSchema>;

export interface LegacyShape {
  model?: Record<string, unknown>;
  /** Old `[budget]` with maxSessionCostUsd. */
  budget?: Record<string, unknown>;
  /** Old `[budgets]` with monthly/goal/task. */
  budgets?: { monthly?: number; goal?: number; task?: number };
  maxParallelAgents?: number;
}

export interface MigrationResult {
  config: LoopcodeConfig;
  notices: string[];
}

/**
 * Map any historical layout onto the canonical schema.
 * Never throws: bad input degrades to defaults plus a notice.
 */
export function migrateConfig(raw: unknown): MigrationResult {
  const notices: string[] = [];
  const input = (raw ?? {}) as LegacyShape & Record<string, unknown>;
  const draft: Record<string, unknown> = {};

  if (input.model && typeof input.model === 'object') {
    draft.model = { ...(input.model as object) };
  }

  const budget: Record<string, number> = {};
  const legacyBudget = (input.budget ?? {}) as Record<string, unknown>;

  if (typeof legacyBudget.maxMonthlyCostUsd === 'number') {
    budget.maxMonthlyCostUsd = legacyBudget.maxMonthlyCostUsd;
  }
  if (typeof legacyBudget.maxTaskCostUsd === 'number') {
    budget.maxTaskCostUsd = legacyBudget.maxTaskCostUsd;
  }
  if (typeof legacyBudget.maxGoalCostUsd === 'number') {
    budget.maxGoalCostUsd = legacyBudget.maxGoalCostUsd;
  } else if (typeof legacyBudget.maxSessionCostUsd === 'number') {
    budget.maxGoalCostUsd = legacyBudget.maxSessionCostUsd;
    notices.push('config: [budget].maxSessionCostUsd is deprecated; use maxGoalCostUsd.');
  }

  if (input.budgets && typeof input.budgets === 'object') {
    const b = input.budgets;
    if (typeof b.monthly === 'number' && budget.maxMonthlyCostUsd === undefined) {
      budget.maxMonthlyCostUsd = b.monthly;
    }
    if (typeof b.goal === 'number' && budget.maxGoalCostUsd === undefined) {
      budget.maxGoalCostUsd = b.goal;
    }
    if (typeof b.task === 'number' && budget.maxTaskCostUsd === undefined) {
      budget.maxTaskCostUsd = b.task;
    }
    notices.push(
      'config: [budgets] is deprecated; rename the table to [budget] with maxMonthlyCostUsd / maxGoalCostUsd / maxTaskCostUsd.',
    );
  }

  if (Object.keys(budget).length > 0) {
    draft.budget = budget;
  }

  if (input.proxy && typeof input.proxy === 'object') draft.proxy = input.proxy;
  if (input.ui && typeof input.ui === 'object') draft.ui = input.ui;

  const safety: Record<string, unknown> = { ...((input.safety as object) ?? {}) };
  if (typeof input.maxParallelAgents === 'number') {
    safety.maxParallelAgents = input.maxParallelAgents;
    notices.push('config: top-level maxParallelAgents moved to [safety].maxParallelAgents.');
  }
  if (Object.keys(safety).length > 0) draft.safety = safety;

  const parsed = ConfigSchema.safeParse(draft);
  if (parsed.success) {
    return { config: parsed.data, notices };
  }

  notices.push(`config: ignoring invalid values (${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}).`);
  return { config: ConfigSchema.parse({}), notices };
}
