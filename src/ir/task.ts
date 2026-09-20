import { z } from 'zod';

export const ModelSpecSchema = z.object({
  tier: z.enum(['frontier', 'strong', 'efficient', 'local', 'auto']),
  preferredProvider: z.string().optional(),
  fallbackProvider: z.string().optional(),
  contextWindowRequired: z.number().optional(),
});

export const BudgetSchema = z.object({
  maxCostUsd: z.number(),
  maxDurationSeconds: z.number(),
  maxRetries: z.number(),
  maxTokens: z.number(),
});

export const TaskNodeSchema = z.object({
  id: z.string(),
  type: z.enum(['plan', 'research', 'implement', 'review', 'verify', 'fix']),
  description: z.string(),
  goal: z.string(),
  systemPrompt: z.string(),
  inputs: z.array(
    z.object({
      type: z.string(),
      source: z.string(),
    }),
  ),
  outputs: z.array(
    z.object({
      type: z.string(),
      destination: z.string(),
    }),
  ),
  dependencies: z.array(z.string()),
  readAllowlist: z.array(z.string()),
  writeAllowlist: z.array(z.string()),
  modelSpec: ModelSpecSchema,
  budget: BudgetSchema,
  acceptanceCriteria: z.array(z.string()),
  agentRole: z.enum(['planner', 'researcher', 'engineer', 'reviewer', 'verifier']),
});

export const TaskEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  type: z.enum(['dependency', 'conflict', 'sequence']),
});

export const TaskIRSchema = z.object({
  id: z.string(),
  goalId: z.string(),
  phase: z.enum(['planning', 'executing', 'verifying', 'done', 'failed']),
  tasks: z.array(TaskNodeSchema),
  edges: z.array(TaskEdgeSchema),
  metadata: z.object({
    totalEstimatedCost: z.number(),
    totalEstimatedDuration: z.number(),
    parallelizable: z.boolean(),
    retryPolicy: z.object({
      maxTotalRetries: z.number(),
      backoffFactor: z.number(),
    }),
  }),
});

export type ModelSpec = z.infer<typeof ModelSpecSchema>;
export type Budget = z.infer<typeof BudgetSchema>;
export type TaskNode = z.infer<typeof TaskNodeSchema>;
export type TaskEdge = z.infer<typeof TaskEdgeSchema>;
export type TaskIR = z.infer<typeof TaskIRSchema>;
