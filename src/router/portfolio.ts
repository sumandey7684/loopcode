export interface ModelSpec {
  modelID: string;
  providerID: string;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
  contextWindow: number;
  latencyRating: 'low' | 'medium' | 'high';
}

export const ModelPortfolio: Record<string, ModelSpec> = {
  'claude-fable-5': {
    modelID: 'claude-fable-5',
    providerID: 'anthropic',
    inputCostPerMillion: 10.0,
    outputCostPerMillion: 50.0,
    contextWindow: 1000000,
    latencyRating: 'high',
  },
  'claude-4.8-opus': {
    modelID: 'claude-4.8-opus',
    providerID: 'anthropic',
    inputCostPerMillion: 5.0,
    outputCostPerMillion: 25.0,
    contextWindow: 1000000,
    latencyRating: 'high',
  },
  'claude-5-sonnet': {
    modelID: 'claude-5-sonnet',
    providerID: 'anthropic',
    inputCostPerMillion: 3.0,
    outputCostPerMillion: 15.0,
    contextWindow: 1000000,
    latencyRating: 'medium',
  },
  'kimi-k2.6': {
    modelID: 'kimi-k2.6',
    providerID: 'moonshot',
    inputCostPerMillion: 0.3,
    outputCostPerMillion: 1.2,
    contextWindow: 1000000,
    latencyRating: 'medium',
  },
  'deepseek-v4-pro': {
    modelID: 'deepseek-v4-pro',
    providerID: 'deepseek',
    inputCostPerMillion: 0.435,
    outputCostPerMillion: 0.87,
    contextWindow: 1000000,
    latencyRating: 'medium',
  },
  'gemini-3.5-flash': {
    modelID: 'gemini-3.5-flash',
    providerID: 'google',
    inputCostPerMillion: 1.5,
    outputCostPerMillion: 9.0,
    contextWindow: 1000000,
    latencyRating: 'low',
  },
  'deepseek-v4-flash': {
    modelID: 'deepseek-v4-flash',
    providerID: 'deepseek',
    inputCostPerMillion: 0.14,
    outputCostPerMillion: 0.28,
    contextWindow: 1000000,
    latencyRating: 'low',
  },
  'gemini-3.1-pro': {
    modelID: 'gemini-3.1-pro',
    providerID: 'google',
    inputCostPerMillion: 2.0,
    outputCostPerMillion: 12.0,
    contextWindow: 1000000,
    latencyRating: 'medium',
  },
};
