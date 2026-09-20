export interface ModelCostRate {
  inputPerMillion: number;
  outputPerMillion: number;
}

export class CostTracker {
  private totalCost: number = 0;

  // Fallback cost calculator if server cost is not returned.
  // Pricing based on Claude 5 Sonnet / Claude 4.8 Opus standards.
  private static costRates: Record<string, ModelCostRate> = {
    'claude-5-sonnet': { inputPerMillion: 3.0, outputPerMillion: 15.0 },
    'claude-4.8-opus': { inputPerMillion: 5.0, outputPerMillion: 25.0 },
  };

  /**
   * Tracks and adds cost.
   * If OpenCode returns a pre-calculated cost, we use it directly.
   * Otherwise, we fallback to estimating it based on tokens.
   */
  trackCost(opencodeCost?: number, modelID?: string, tokens?: { input: number; output: number }): number {
    if (opencodeCost !== undefined && opencodeCost > 0) {
      this.totalCost += opencodeCost;
      return opencodeCost;
    }

    if (modelID && tokens) {
      const rate = CostTracker.costRates[modelID] || CostTracker.costRates['claude-5-sonnet'];
      const calculated = (tokens.input * rate.inputPerMillion + tokens.output * rate.outputPerMillion) / 1000000;
      this.totalCost += calculated;
      return calculated;
    }

    return 0;
  }

  getTotalCost(): number {
    return this.totalCost;
  }

  reset() {
    this.totalCost = 0;
  }
}
