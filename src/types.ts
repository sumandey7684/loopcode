export interface VerificationStep {
  type: 'compile' | 'test' | 'lint';
  command: string;
  expectedExitCode: number;
}

export type TaskCategory = 'test' | 'docs' | 'security' | 'refactor' | 'feature' | 'fix' | 'other';

export interface Task {
  id: string;
  description: string;
  goal: string;
  category: TaskCategory;
  systemPrompt: string; // This will be prepended to the goal instead of sent as a system prompt
  expectedOutputs: string[]; // Files that should be created/modified
  writeAllowlist: string[]; // Files this task is allowed to modify
  verification: VerificationStep[];
  maxCost: number; // USD, e.g. 2.00
  timeout: number; // Seconds, e.g. 300
  model?: string; // Static router override
}

export interface VerificationReport {
  taskId: string;
  layers: {
    compile?: { passed: boolean; stdout: string; stderr: string; durationMs: number };
    test?: { passed: boolean; testCount: number; failCount: number; stdout: string; durationMs: number };
    lint?: { passed: boolean; stdout: string; stderr: string; durationMs: number };
  };
  overallPass: boolean;
  timestamp: string;
}

export type TaskResult = {
  success: boolean;
  message?: string;
};
