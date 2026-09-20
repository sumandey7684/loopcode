import { z } from 'zod';
import { VerificationIRSchema } from './verification.js';

export const CompletionIRSchema = z.object({
  goalId: z.string(),
  taskId: z.string(),
  status: z.enum(['success', 'partial', 'failed']),
  summary: z.string(),
  filesChanged: z.array(z.string()),
  totalCost: z.number(),
  totalDurationMs: z.number(),
  verificationReport: VerificationIRSchema,
  gitCommit: z.string(),
  lessonsLearned: z.array(z.string()),
});

export type CompletionIR = z.infer<typeof CompletionIRSchema>;
