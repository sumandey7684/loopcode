/** True when running under a test runner. Never use runner-specific env directly. */
export function isTestEnv(): boolean {
  return Boolean(process.env.LOOPCODE_TEST || process.env.BUN_TEST || process.env.VITEST);
}

/** True when stdin/stdout can host an interactive TUI. */
export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY) && !isTestEnv();
}

/** Explicit non-interactive automation mode (CI, pipes, --headless). */
export function isHeadless(): boolean {
  return Boolean(process.env.LOOPCODE_HEADLESS) || !isInteractive();
}
