import * as fs from 'node:fs';
import * as path from 'node:path';

export type PackageManager = 'bun' | 'pnpm' | 'yarn' | 'npm';

export interface ProjectCommands {
  manager: PackageManager;
  /** Undefined when the project defines no such script. */
  build?: string[];
  test?: string[];
  lint?: string[];
  typecheck?: string[];
}

const LOCKFILES: Array<{ file: string; manager: PackageManager }> = [
  { file: 'bun.lock', manager: 'bun' },
  { file: 'bun.lockb', manager: 'bun' },
  { file: 'pnpm-lock.yaml', manager: 'pnpm' },
  { file: 'yarn.lock', manager: 'yarn' },
  { file: 'package-lock.json', manager: 'npm' },
];

export function detectPackageManager(cwd: string): PackageManager {
  for (const { file, manager } of LOCKFILES) {
    if (fs.existsSync(path.join(cwd, file))) return manager;
  }
  // packageManager field wins over nothing at all.
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8')) as {
      packageManager?: string;
    };
    const declared = pkg.packageManager?.split('@')[0];
    if (declared === 'bun' || declared === 'pnpm' || declared === 'yarn' || declared === 'npm') {
      return declared;
    }
  } catch {
    /* no package.json */
  }
  return 'npm';
}

function runScript(manager: PackageManager, script: string): string[] {
  // `run` works for all four; yarn v1 also accepts it.
  return [manager, 'run', script];
}

/**
 * Resolve concrete verification commands for a project.
 * Returns argv arrays (never shell strings) so callers can avoid shell parsing.
 */
export function resolveProjectCommands(cwd: string): ProjectCommands {
  const manager = detectPackageManager(cwd);
  let scripts: Record<string, string> = {};
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    scripts = pkg.scripts ?? {};
  } catch {
    return { manager };
  }

  const pick = (...names: string[]): string[] | undefined => {
    for (const name of names) {
      if (typeof scripts[name] === 'string' && scripts[name].trim()) {
        return runScript(manager, name);
      }
    }
    return undefined;
  };

  return {
    manager,
    build: pick('build', 'compile'),
    test: pick('test', 'tests', 'test:unit'),
    lint: pick('lint', 'eslint'),
    typecheck: pick('typecheck', 'type-check', 'tsc'),
  };
}
