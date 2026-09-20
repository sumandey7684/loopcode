import * as crypto from 'node:crypto';

export interface StateSignature {
  phase: string;
  taskIndex: number;
  filesChanged: string[];
  lastError?: string;
  retryAttempt?: number;
}

export class LoopDetector {
  private seenSignatures: Set<string> = new Set();
  private maxPlanIterations: number = 3;
  private maxFixIterations: number = 3;

  constructor(maxPlan: number = 3, maxFix: number = 3) {
    this.maxPlanIterations = maxPlan;
    this.maxFixIterations = maxFix;
  }

  /**
   * Generates a unique hash signature for the current orchestrator state.
   */
  generateHash(sig: StateSignature): string {
    const data = JSON.stringify({
      phase: sig.phase,
      taskIndex: sig.taskIndex,
      filesChanged: [...sig.filesChanged].sort(),
      lastError: sig.lastError || '',
      retryAttempt: sig.retryAttempt || 0,
    });
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Records a state signature and returns true if an oscillation/loop is detected.
   */
  detectOscillation(sig: StateSignature): boolean {
    const hash = this.generateHash(sig);
    if (this.seenSignatures.has(hash)) {
      console.warn(`[LoopDetector] Loop/Oscillation detected for state signature hash: ${hash}`);
      return true;
    }
    this.seenSignatures.add(hash);
    return false;
  }

  clear() {
    this.seenSignatures.clear();
  }
}
