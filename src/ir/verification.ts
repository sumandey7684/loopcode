import { z } from 'zod';

export const VerificationLayerSchema = z.object({
  name: z.string(),
  type: z.enum(['compile', 'test', 'lint', 'security', 'review']),
  passed: z.boolean(),
  evidence: z.string(),
  durationMs: z.number(),
  cost: z.number(),
  confidence: z.number().min(0).max(1),
});

export const RegressionSchema = z.object({
  file: z.string(),
  description: z.string(),
  severity: z.enum(['warning', 'error', 'critical']),
});

export const VerificationIRSchema = z.object({
  taskId: z.string(),
  layers: z.array(VerificationLayerSchema),
  overallPass: z.boolean(),
  canRetry: z.boolean(),
  retryHint: z.string().optional(),
  regressions: z.array(RegressionSchema),
});

export type VerificationLayer = z.infer<typeof VerificationLayerSchema>;
export type Regression = z.infer<typeof RegressionSchema>;
export type VerificationIR = z.infer<typeof VerificationIRSchema>;
