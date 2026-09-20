import { z } from 'zod';

export const AcceptanceCriterionSchema = z.object({
  id: z.string(),
  description: z.string(),
  verificationType: z.enum(['compile', 'test', 'lint', 'security', 'review']),
  mustPass: z.boolean(),
  autoVerify: z.boolean(),
});

export const GoalIRSchema = z.object({
  id: z.string(),
  rawGoal: z.string(),
  classification: z.object({
    complexity: z.enum(['simple', 'medium', 'complex', 'very_complex']),
    estimatedFiles: z.number(),
    estimatedTasks: z.number(),
    requiresResearch: z.boolean(),
    domain: z.enum(['frontend', 'backend', 'devops', 'security', 'refactor', 'other']),
  }),
  acceptanceCriteria: z.array(AcceptanceCriterionSchema),
  constraints: z.object({
    maxCost: z.number(),
    maxDuration: z.number(),
    allowedModels: z.array(z.string()),
    forbiddenModels: z.array(z.string()),
  }),
  contextHints: z.object({
    relevantFiles: z.array(z.string()),
    relevantSymbols: z.array(z.string()),
    techStack: z.array(z.string()),
  }),
});

export type AcceptanceCriterion = z.infer<typeof AcceptanceCriterionSchema>;
export type GoalIR = z.infer<typeof GoalIRSchema>;
