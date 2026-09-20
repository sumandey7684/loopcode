import * as crypto from 'node:crypto';

export interface CapturedCallback {
  code?: string;
  state?: string;
  error?: string;
  raw: string;
}

export interface Listener {
  port: number;
  redirectUri: string;
  /** Expected `state` value; mismatches are rejected. */
  state: string;
  /** Resolves on the first valid callback, rejects on timeout/abort. */
  wait: Promise<CapturedCallback>;
  close: () => void;
}

const SUCCESS_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>LoopCode — signed in</title>
<style>
 body{font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0d1117;color:#e6edf3;
      display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
 .card{max-width:26rem;padding:2rem;border:1px solid #30363d;border-radius:12px;background:#161b22}
 h1{font-size:1.1rem;margin:0 0 .5rem} p{margin:.25rem 0;color:#8b949e}
 .ok{color:#3fb950;font-size:2rem;line-height:1}
</style></head>
<body><div class="card" role="status" aria-live="polite">
<div class="ok" aria-hidden="true">&#10003;</div>
<h1>Signed in</h1><p>You can close this tab and return to your terminal.</p>
</div></body></html>`;

const FAILURE_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>LoopCode — sign-in failed</title></head>
<body style="font-family:sans-serif;background:#0d1117;color:#e6edf3">
<h1>Sign-in failed</h1><p>Return to your terminal for details.</p></body></html>`;

/**
 * One-shot loopback capture for OAuth redirects.
 *
 * Security posture:
 *  - binds 127.0.0.1 only
 *  - serves exactly one meaningful response, then stops
 *  - rejects callbacks whose `state` does not match
 *  - hard timeout so we never leave a listener running
 */
export async function startLoopbackListener(options?: {
  preferredPort?: number;
  path?: string;
  timeoutMs?: number;
}): Promise<Listener> {
  const path = options?.path ?? '/callback';
  const timeoutMs = options?.timeoutMs ?? 300_000; // 5 minutes
  const state = crypto.randomBytes(16).toString('hex');

  let resolveWait!: (v: CapturedCallback) => void;
  let rejectWait!: (e: Error) => void;
  const wait = new Promise<CapturedCallback>((res, rej) => {
    resolveWait = res;
    rejectWait = rej;
  });

  let settled = false;
  const candidates = [options?.preferredPort ?? 51121, 51122, 51123, 0];
  let server: ReturnType<typeof Bun.serve> | null = null;
  let boundPort = 0;

  for (const candidate of candidates) {
    try {
      server = Bun.serve({
        hostname: '127.0.0.1',
        port: candidate,
        fetch(req) {
          const url = new URL(req.url);
          if (url.pathname !== path) return new Response('Not found', { status: 404 });

          const code = url.searchParams.get('code') ?? undefined;
          const gotState = url.searchParams.get('state') ?? undefined;
          const error = url.searchParams.get('error') ?? undefined;

          if (gotState && gotState !== state) {
            return new Response(FAILURE_HTML, {
              status: 400,
              headers: { 'content-type': 'text/html; charset=utf-8' },
            });
          }

          if (!settled) {
            settled = true;
            resolveWait({ code, state: gotState, error, raw: url.search });
            // Give the browser its response before tearing down.
            setTimeout(() => server?.stop(true), 250);
          }

          return new Response(error ? FAILURE_HTML : SUCCESS_HTML, {
            status: error ? 400 : 200,
            headers: { 'content-type': 'text/html; charset=utf-8' },
          });
        },
      });
      boundPort = server.port ?? 0;
      break;
    } catch {
      server = null;
    }
  }

  if (!server) {
    throw new Error('Could not bind a loopback port for the OAuth callback (tried 51121-51123).');
  }

  const timer = setTimeout(() => {
    if (!settled) {
      settled = true;
      server?.stop(true);
      rejectWait(new Error('Timed out waiting for the OAuth redirect.'));
    }
  }, timeoutMs);

  // Never keep the process alive just for this listener.
  if (typeof timer === 'object' && 'unref' in timer) {
    (timer as { unref: () => void }).unref();
  }

  return {
    port: boundPort,
    redirectUri: `http://127.0.0.1:${boundPort}${path}`,
    state,
    wait,
    close: () => {
      clearTimeout(timer);
      if (!settled) settled = true;
      server?.stop(true);
    },
  };
}
