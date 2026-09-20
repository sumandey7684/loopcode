#!/usr/bin/env node
import { Command } from 'commander';
import { createRequire } from 'node:module';
import { runCli } from './cli/runner.js';
import { logger } from './app/logger.js';
import { defaultDbPath } from './platform/paths.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

/** Documented exit codes. Keep in sync with docs/config-auth.md. */
export const EXIT = {
  OK: 0,
  ERROR: 1,
  BUDGET_EXCEEDED: 77,
  INTERRUPTED: 130,
} as const;

const program = new Command();

program
  .name('loopcode')
  .description('LoopCode: autonomous software engineering orchestrator')
  .version(pkg.version)
  .argument('[goal]', 'the goal you want LoopCode to achieve')
  .option('-r, --resume <taskId>', 'resume an in-progress task by id')
  .option('-d, --db <path>', 'path to the SQLite database', defaultDbPath())
  .option('--login', 'open the provider connection flow and exit')
  .option('--headless', 'run without the interactive UI (implies non-interactive approvals)')
  .action(
    async (goal: string | undefined, options: { resume?: string; db: string; login?: boolean; headless?: boolean }) => {
      if (options.headless) process.env.LOOPCODE_HEADLESS = '1';

      try {
        const code = await runCli({
          goal,
          resumeTaskId: options.resume,
          dbPath: options.db,
          forceLogin: options.login,
        });
        process.exit(code);
      } catch (err) {
        const message = (err as Error).message ?? String(err);
        if (message.includes('BUDGET_TERMINATION') || (err as any)?.exitCode === 77) {
          logger.error('cli', message);
          process.exit(EXIT.BUDGET_EXCEEDED);
        }
        logger.error('cli', `Fatal error: ${message}`);
        process.exit(EXIT.ERROR);
      } finally {
        logger.close();
      }
    },
  );

program.parse();
