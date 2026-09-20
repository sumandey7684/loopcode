import { configStore } from './config/store.js';
import type { ModelRoute } from './router.js';

/** @deprecated Use configStore from ./config/store.js */
export class ConfigManager {
  static loadConfig() {
    const c = configStore.get();
    // Shape kept for callers that still read config.budget?.maxMonthlyCostUsd etc.
    return {
      model: c.model,
      budget: {
        maxMonthlyCostUsd: c.budget.maxMonthlyCostUsd,
        maxSessionCostUsd: c.budget.maxGoalCostUsd,
        maxTaskCostUsd: c.budget.maxTaskCostUsd,
      },
      maxParallelAgents: c.safety.maxParallelAgents,
    };
  }

  static resolveModelRoute(modelStr?: string): ModelRoute | undefined {
    if (!modelStr) return undefined;
    const idx = modelStr.indexOf('/');
    if (idx <= 0 || idx === modelStr.length - 1) return undefined;
    return { providerID: modelStr.slice(0, idx), modelID: modelStr.slice(idx + 1) };
  }
}

export type { LoopcodeConfig } from './config/schema.js';
