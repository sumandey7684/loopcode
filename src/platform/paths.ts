import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';

/** All LoopCode state lives under one root so it is trivial to inspect or delete. */
export function configDir(): string {
  const override = process.env.LOOPCODE_CONFIG_DIR;
  if (override && override.trim()) return path.resolve(override);
  return path.join(os.homedir(), '.loopcode');
}

export function configFile(): string {
  return path.join(configDir(), 'config.toml');
}

export function trustedDirsFile(): string {
  return path.join(configDir(), 'trusted_dirs.json');
}

export function logFile(): string {
  return path.join(configDir(), 'logs', 'loopcode.log');
}

export function stateDir(): string {
  return path.join(configDir(), 'state');
}

/** Default DB path; --db overrides. Kept project-local so goals stay per-repo. */
export function defaultDbPath(cwd = process.cwd()): string {
  return path.join(cwd, 'loopcode.db');
}

export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}
