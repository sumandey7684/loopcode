import React from 'react';
import { render } from 'ink';
import { App } from './app.js';
import { createController } from '../app/session-controller-impl.js';
import { configStore } from '../config/store.js';
import { logger } from '../app/logger.js';
import { isHeadless } from '../platform/env.js';

export interface RunnerOptions {
  goal?: string;
  resumeTaskId?: string;
  dbPath: string;
  /** --login opens onboarding even when already authenticated. */
  forceLogin?: boolean;
}

/**
 * Bootstrap only: build the controller, decide TUI vs headless, render.
 */
export async function runCli(
  options?: RunnerOptions | string,
  resumeTaskIdArg?: string,
  dbPathArg = 'loopcode.db',
): Promise<number> {
  const opts: RunnerOptions =
    typeof options === 'object' && options !== null
      ? options
      : { goal: options, resumeTaskId: resumeTaskIdArg, dbPath: dbPathArg };

  const { config, notices } = configStore.load();
  for (const notice of notices) logger.notice('warn', notice);

  const controller = await createController({ dbPath: opts.dbPath || 'loopcode.db', config });

  if (isHeadless()) {
    if (opts.goal) {
      await controller.runGoal(opts.goal);
    } else if (opts.resumeTaskId) {
      await controller.resume(opts.resumeTaskId);
    }
    await controller.shutdown();
    return controller.exitCode();
  }

  const needsOnboarding =
    Boolean(opts.forceLogin) || !controller.isDirectoryTrusted() || !(await controller.hasUsableProvider());

  logger.setTuiActive(true);
  logger.attach(controller.bus);

  const instance = render(
    <App
      controller={controller}
      needsOnboarding={needsOnboarding}
      initialGoal={opts.goal}
      resumeTaskId={opts.resumeTaskId}
    />,
    { exitOnCtrlC: false },
  );

  await instance.waitUntilExit();
  await controller.shutdown();
  return controller.exitCode();
}
