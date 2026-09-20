import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse, stringify } from 'smol-toml';
import { ConfigSchema, migrateConfig, type LoopcodeConfig } from './schema.js';
import { configFile, configDir, ensureDir } from '../platform/paths.js';

export interface LoadedConfig {
  config: LoopcodeConfig;
  notices: string[];
  /** Path the config came from, or null when all defaults. */
  source: string | null;
}

function readToml(file: string): { value: unknown; error?: string } {
  try {
    if (!fs.existsSync(file)) return { value: undefined };
    return { value: parse(fs.readFileSync(file, 'utf8')) };
  } catch (err) {
    return { value: undefined, error: `${file}: ${(err as Error).message}` };
  }
}

/** Environment overrides applied after file load. */
function applyEnv(config: LoopcodeConfig, notices: string[]): LoopcodeConfig {
  const next = structuredClone(config);

  const num = (key: string): number | undefined => {
    const raw = process.env[key];
    if (!raw) return undefined;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    notices.push(`env: ${key}="${raw}" is not a positive number; ignored.`);
    return undefined;
  };

  const monthly = num('LOOPCODE_MAX_MONTHLY_USD');
  if (monthly !== undefined) next.budget.maxMonthlyCostUsd = monthly;
  const goal = num('LOOPCODE_MAX_GOAL_USD');
  if (goal !== undefined) next.budget.maxGoalCostUsd = goal;
  const task = num('LOOPCODE_MAX_TASK_USD');
  if (task !== undefined) next.budget.maxTaskCostUsd = task;

  if (process.env.LOOPCODE_ASCII === '1') next.ui.ascii = true;
  if (process.env.LOOPCODE_MODEL) next.model.default = process.env.LOOPCODE_MODEL;

  return next;
}

export class ConfigStore {
  private cache: LoadedConfig | null = null;

  load(force = false): LoadedConfig {
    if (this.cache && !force) return this.cache;

    const notices: string[] = [];
    const primaryPath = configFile();
    const primary = readToml(primaryPath);
    if (primary.error) notices.push(`config: ${primary.error}`);

    let raw = primary.value;
    let source: string | null = primary.value ? primaryPath : null;

    // Legacy: ./config.toml was read by the old CostEngine. Accept once, warn.
    if (!raw) {
      const legacyPath = path.join(process.cwd(), 'config.toml');
      const legacy = readToml(legacyPath);
      if (legacy.value) {
        raw = legacy.value;
        source = legacyPath;
        notices.push(`config: reading legacy ${legacyPath}. Move it to ${primaryPath}.`);
      }
    }

    const migrated = migrateConfig(raw);
    notices.push(...migrated.notices);

    const config = applyEnv(migrated.config, notices);
    this.cache = { config, notices, source };
    return this.cache;
  }

  get(): LoopcodeConfig {
    return this.load().config;
  }

  /** Merge a partial update and persist to the canonical path. */
  save(patch: Partial<LoopcodeConfig>): LoopcodeConfig {
    const current = this.get();
    const merged = ConfigSchema.parse({
      model: { ...current.model, ...(patch.model ?? {}) },
      budget: { ...current.budget, ...(patch.budget ?? {}) },
      proxy: { ...current.proxy, ...(patch.proxy ?? {}) },
      ui: { ...current.ui, ...(patch.ui ?? {}) },
      safety: { ...current.safety, ...(patch.safety ?? {}) },
    });

    ensureDir(configDir());
    const tmp = `${configFile()}.tmp`;
    fs.writeFileSync(tmp, stringify(merged as unknown as Record<string, unknown>), { mode: 0o600 });
    fs.renameSync(tmp, configFile());

    this.cache = { config: merged, notices: [], source: configFile() };
    return merged;
  }
}

export const configStore = new ConfigStore();
