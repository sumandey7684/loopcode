export interface ProjectContext {
  estimatedFilesAffected?: number;
  recentChangesCount?: number;
}

export interface ClassificationResult {
  path: 'single_agent' | 'full_loop';
  confidence: number;
  reason: string;
  estimatedTokens: number;
  recommendedModel: string;
}

export class Classifier {
  /**
   * Tier 1: Fast regex filter rules.
   */
  private static fastRules = [
    {
      pattern: /^fix\s+(typo|spelling|grammar)/i,
      path: 'single_agent' as const,
      model: 'gemini-3.5-flash',
      reason: 'Typo or spelling fix',
    },
    {
      pattern: /^add\s+comment/i,
      path: 'single_agent' as const,
      model: 'gemini-3.5-flash',
      reason: 'Adding simple documentation comment',
    },
    {
      pattern: /^rename\s+(variable|function)/i,
      path: 'single_agent' as const,
      model: 'gemini-3.5-flash',
      reason: 'Variable/function rename',
    },
    {
      pattern: /^update\s+(dependency|version)/i,
      path: 'single_agent' as const,
      model: 'gemini-3.5-flash',
      reason: 'Dependency version bump',
    },
    {
      pattern: /^refactor\s+architecture/i,
      path: 'full_loop' as const,
      model: 'claude-4.8-opus',
      reason: 'Architectural refactoring requires graph',
    },
    {
      pattern: /^implement\s+auth/i,
      path: 'full_loop' as const,
      model: 'claude-4.8-opus',
      reason: 'Complex authentication workflow',
    },
    {
      pattern: /^migrate\s+database/i,
      path: 'full_loop' as const,
      model: 'claude-4.8-opus',
      reason: 'Database migration requires structural safety',
    },
  ];

  /**
   * Classify a natural language goal into either the single_agent path or full_loop path.
   */
  static classifyGoal(goal: string, context?: ProjectContext): ClassificationResult {
    // TIER 1: Rule-based fast filter (<1ms)
    for (const rule of this.fastRules) {
      if (rule.pattern.test(goal)) {
        return {
          path: rule.path,
          confidence: 0.9,
          reason: `Matched fast rule: ${rule.reason}`,
          estimatedTokens: rule.path === 'single_agent' ? 2000 : 50000,
          recommendedModel: rule.model,
        };
      }
    }

    // TIER 2: Heuristic analysis (<10ms)
    const fileCount = context?.estimatedFilesAffected ?? 1;
    const lowerGoal = goal.toLowerCase();
    const isComplexKeyword =
      lowerGoal.includes('test') ||
      lowerGoal.includes('integrate') ||
      lowerGoal.includes('optimize') ||
      lowerGoal.includes('refactor');

    if (fileCount <= 2 && !isComplexKeyword) {
      return {
        path: 'single_agent',
        confidence: 0.75,
        reason: 'Low estimated files affected, low complexity keyword score',
        estimatedTokens: 3000,
        recommendedModel: 'claude-5-sonnet',
      };
    }

    // TIER 3: Default fallback to full loop for safety
    return {
      path: 'full_loop',
      confidence: 0.6,
      reason: 'Default: potentially complex or cross-file task',
      estimatedTokens: 50000,
      recommendedModel: 'claude-4.8-opus',
    };
  }
}
