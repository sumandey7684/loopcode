import type { Task } from './types.js';

export interface ModelRoute {
  providerID: string;
  modelID: string;
}

export class Router {
  private defaultModel: ModelRoute;
  private planningModel: ModelRoute;
  private verificationModel: ModelRoute;
  private cheapModel: ModelRoute;
  private userOverrides: { default?: ModelRoute; planning?: ModelRoute; verification?: ModelRoute };

  constructor(config?: { default?: ModelRoute; planning?: ModelRoute; verification?: ModelRoute }) {
    this.userOverrides = config || {};
    this.cheapModel = config?.default || { providerID: 'anthropic', modelID: 'claude-5-sonnet' };
    this.defaultModel = config?.default || { providerID: 'anthropic', modelID: 'claude-5-sonnet' };
    this.planningModel = config?.planning || { providerID: 'anthropic', modelID: 'claude-4.8-opus' };
    this.verificationModel = config?.verification || { providerID: 'anthropic', modelID: 'claude-5-sonnet' };
  }

  /**
   * Route a task to the appropriate model based on structured categories and rules.
   */
  route(task: Task): ModelRoute {
    // Check if user set an explicit override in the task itself
    if (task.model) {
      const parts = task.model.split('/');
      if (parts.length === 2) {
        return { providerID: parts[0], modelID: parts[1] };
      }
    }

    switch (task.category) {
      case 'test':
      case 'docs':
        return this.cheapModel;

      case 'security':
      case 'refactor':
        return this.planningModel;

      case 'feature':
      case 'fix':
        // File count heuristic: if task makes complex changes, route to stronger model
        if (task.expectedOutputs && task.expectedOutputs.length > 2) {
          return this.planningModel;
        }
        return this.defaultModel;

      default:
        return this.defaultModel;
    }
  }

  getPlanningModel(): ModelRoute {
    return this.planningModel;
  }

  getVerificationModel(): ModelRoute {
    return this.verificationModel;
  }

  /**
   * Dynamically updates routed models based on ready/configured OpenCode providers.
   */
  updateModelsBasedOnProviders(availableProviders: string[], allProvidersData?: any[], defaultModelConfig?: any) {
    if (!availableProviders || availableProviders.length === 0) return;

    const PROVIDER_PRIORITY = ['anthropic', 'openai', 'deepseek', 'google', 'openrouter'];

    // Find the first available provider that matches our priority list
    let activeProvider = PROVIDER_PRIORITY.find((p) => availableProviders.includes(p));

    // If none of our prioritized providers are available, pick the first configured provider
    if (!activeProvider) {
      activeProvider = availableProviders[0];
    }

    if (!activeProvider) return;

    // Check if OpenCode has a default model configured that matches this provider
    let openCodeDefaultModel: ModelRoute | undefined = undefined;
    if (defaultModelConfig && defaultModelConfig.model) {
      const parts = defaultModelConfig.model.split('/');
      if (parts.length === 2 && parts[0] === activeProvider) {
        openCodeDefaultModel = { providerID: parts[0], modelID: parts[1] };
      }
    }

    const PROVIDER_MODELS: Record<string, { cheap: string; standard: string; strong: string }> = {
      anthropic: {
        cheap: 'claude-3-5-haiku',
        standard: 'claude-5-sonnet',
        strong: 'claude-4.8-opus',
      },
      openai: {
        cheap: 'gpt-4o-mini',
        standard: 'gpt-4o',
        strong: 'o1',
      },
      google: {
        cheap: 'gemini-2.5-flash',
        standard: 'gemini-2.5-flash',
        strong: 'gemini-2.5-pro',
      },
      deepseek: {
        cheap: 'deepseek-chat',
        standard: 'deepseek-chat',
        strong: 'deepseek-reasoner',
      },
      openrouter: {
        cheap: 'google/gemini-2.5-flash',
        standard: 'anthropic/claude-3.5-sonnet',
        strong: 'deepseek/deepseek-r1',
      },
    };

    let cheap = '';
    let standard = '';
    let strong = '';

    if (PROVIDER_MODELS[activeProvider]) {
      const entry = PROVIDER_MODELS[activeProvider];
      cheap = entry.cheap;
      standard = entry.standard;
      strong = entry.strong;
    } else {
      // Dynamic model discovery for custom/niche providers (Kimi, GLM, Qwen, Ollama, etc.)
      const providerData = allProvidersData?.find((p: any) => p.id === activeProvider);
      const modelsList: string[] = providerData?.models || [];

      if (modelsList.length > 0) {
        // Simple heuristics to classify models by strength
        const findModel = (keywords: string[], fallbackIndex: number): string => {
          const match = modelsList.find((m) => keywords.some((kw) => m.toLowerCase().includes(kw)));
          return match || modelsList[Math.min(fallbackIndex, modelsList.length - 1)];
        };

        cheap = findModel(['mini', 'flash', 'haiku', '8b', '7b', 'small', 'cheap'], 0);
        strong = findModel(
          ['pro', 'opus', 'large', '70b', '72b', 'reasoner', 'r1', 'o1', 'max'],
          modelsList.length - 1,
        );
        standard =
          openCodeDefaultModel?.modelID ||
          findModel(['sonnet', 'chat', 'standard', 'medium'], Math.floor(modelsList.length / 2));
      } else {
        // Fallback if no models list is returned
        cheap = openCodeDefaultModel?.modelID || 'default';
        standard = openCodeDefaultModel?.modelID || 'default';
        strong = openCodeDefaultModel?.modelID || 'default';
      }
    }

    // Helper to convert string model name to ModelRoute
    const parseModel = (str: string): ModelRoute => {
      const parts = str.split('/');
      if (parts.length === 2) {
        return { providerID: parts[0], modelID: parts[1] };
      }
      return { providerID: activeProvider!, modelID: str };
    };

    // Update models if they were not explicitly overridden by the user config.toml
    if (!this.userOverrides.default) {
      this.cheapModel = parseModel(cheap);
      this.defaultModel = parseModel(standard);
      this.verificationModel = parseModel(standard);
    }
    if (!this.userOverrides.planning) {
      this.planningModel = parseModel(strong);
    }
    if (!this.userOverrides.verification) {
      this.verificationModel = parseModel(standard);
    }
  }

  overrideAllModels(route: ModelRoute) {
    this.cheapModel = route;
    this.defaultModel = route;
    this.planningModel = route;
    this.verificationModel = route;
  }
}
