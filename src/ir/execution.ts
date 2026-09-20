import { z } from 'zod';

export const ExecutionStepSchema = z.object({
  id: z.string(),
  type: z.enum(['tool_call', 'file_edit', 'shell_command', 'thinking', 'error']),
  timestamp: z.string(),
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()),
});

export const ExecutionIRSchema = z.object({
  taskId: z.string(),
  sessionId: z.string(),
  modelUsed: z.string(),
  cost: z.number(),
  durationMs: z.number(),
  steps: z.array(ExecutionStepSchema),
  gitState: z.object({
    branch: z.string(),
    commitBefore: z.string(),
    commitAfter: z.string(),
    worktreePath: z.string().optional(),
  }),
});

export type ExecutionStep = z.infer<typeof ExecutionStepSchema>;
export type ExecutionIR = z.infer<typeof ExecutionIRSchema>;
