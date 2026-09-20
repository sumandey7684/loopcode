import { spawn } from 'node:child_process';
import { logger } from '../app/logger.js';
import { isTestEnv } from '../platform/env.js';

/**
 * Open a URL in the user's browser without a shell.
 * Returns false when no opener is available (headless/SSH) so callers can
 * fall back to showing the URL.
 */
export function openBrowser(url: string): boolean {
  // Refuse anything that is not http(s) so we can never launch a file:// or
  // custom-scheme handler from remote input.
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;

  if (process.env.LOOPCODE_NO_BROWSER || process.env.SSH_CONNECTION || isTestEnv()) return false;

  const platform = process.platform;
  const attempts: Array<{ cmd: string; args: string[] }> =
    platform === 'darwin'
      ? [{ cmd: 'open', args: [url] }]
      : platform === 'win32'
        ? [{ cmd: 'cmd', args: ['/c', 'start', '', url] }]
        : [
            { cmd: 'xdg-open', args: [url] },
            { cmd: 'gio', args: ['open', url] },
            { cmd: 'wslview', args: [url] },
          ];

  for (const { cmd, args } of attempts) {
    try {
      const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
      child.unref();
      return true;
    } catch {
      continue;
    }
  }

  logger.debug('auth', 'No browser opener available; will display the URL.');
  return false;
}
