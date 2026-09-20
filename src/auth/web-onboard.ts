import * as crypto from 'node:crypto';
import type { AuthService } from './auth-service.js';
import type { Catalog } from './provider-catalog.js';
import { logger } from '../app/logger.js';

export interface WebOnboardHandle {
  url: string;
  port: number;
  stop: () => void;
  /** Resolves when a credential has been accepted through the page. */
  done: Promise<{ providerId: string }>;
}

/**
 * Minimal loopback-only onboarding page.
 *
 * SECURITY: loopback bind + single-use token + short TTL. There is no auth
 * beyond the token because the surface is unreachable off-host; do not change
 * the hostname binding.
 */
export async function startWebOnboarding(
  auth: AuthService,
  catalog: Catalog,
  options?: { ttlMs?: number },
): Promise<WebOnboardHandle> {
  const token = crypto.randomBytes(24).toString('base64url');
  const ttlMs = options?.ttlMs ?? 600_000;

  let resolveDone!: (v: { providerId: string }) => void;
  const done = new Promise<{ providerId: string }>((res) => {
    resolveDone = res;
  });

  const providers = catalog.providers
    .filter((p) => p.authMethods.some((m) => m.type === 'api'))
    .map((p) => ({ id: p.id, name: p.name, docsUrl: p.docsUrl, env: p.envVars }));

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);

      // Constant-time-ish token gate on every route.
      const provided = url.pathname.split('/')[1] ?? '';
      if (provided.length !== token.length || !crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(token))) {
        return new Response('Not found', { status: 404 });
      }

      const rest = url.pathname.slice(1 + token.length) || '/';

      if (req.method === 'GET' && rest === '/') {
        return new Response(page(token, providers), {
          headers: {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-store',
            'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
            'referrer-policy': 'no-referrer',
          },
        });
      }

      if (req.method === 'POST' && rest === '/key') {
        const body = (await req.json().catch(() => null)) as { provider?: string; key?: string } | null;
        if (!body?.provider || !body?.key) {
          return Response.json({ ok: false, error: 'provider and key are required' }, { status: 400 });
        }
        const result = await auth.setApiKey(body.provider, body.key);
        if (result.ok) {
          resolveDone({ providerId: body.provider });
          setTimeout(() => server.stop(true), 500);
        }
        return Response.json(result, { status: result.ok ? 200 : 400 });
      }

      return new Response('Not found', { status: 404 });
    },
  });

  const timer = setTimeout(() => server.stop(true), ttlMs);
  if (typeof timer === 'object' && 'unref' in timer) (timer as { unref: () => void }).unref();

  const port = server.port ?? 0;
  const url = `http://127.0.0.1:${port}/${token}/`;
  logger.info('auth', `Web onboarding listening on loopback port ${port}.`);

  return {
    url,
    port,
    stop: () => {
      clearTimeout(timer);
      server.stop(true);
    },
    done,
  };
}

function page(token: string, providers: Array<{ id: string; name: string; docsUrl?: string; env: string[] }>): string {
  const options = providers.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('');
  const links = providers
    .filter((p) => p.docsUrl)
    .map(
      (p) =>
        `<li><a href="${escapeHtml(p.docsUrl!)}" target="_blank" rel="noreferrer noopener">${escapeHtml(p.name)} keys</a></li>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>LoopCode — connect a provider</title>
<style>
 :root{color-scheme:dark}
 body{font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0d1117;color:#e6edf3;
      margin:0;display:flex;justify-content:center;padding:3rem 1rem}
 main{width:100%;max-width:32rem}
 h1{font-size:1.25rem;margin:0 0 .25rem}
 p.sub{color:#8b949e;margin:0 0 1.5rem}
 label{display:block;font-weight:600;margin:1rem 0 .35rem}
 select,input{width:100%;padding:.6rem .7rem;border:1px solid #30363d;border-radius:8px;background:#0d1117;
              color:#e6edf3;font:inherit}
 button{margin-top:1.25rem;width:100%;padding:.7rem;border:0;border-radius:8px;background:#238636;color:#fff;
        font:600 15px inherit;cursor:pointer}
 button:disabled{opacity:.6;cursor:progress}
 .note{margin-top:1.5rem;padding:.85rem;border:1px solid #30363d;border-radius:8px;color:#8b949e;font-size:13px}
 ul{margin:.5rem 0 0;padding-left:1.2rem} a{color:#58a6ff}
 #out{margin-top:1rem;font-weight:600} .ok{color:#3fb950} .err{color:#f85149}
</style></head>
<body><main>
 <h1>Connect a provider</h1>
 <p class="sub">This page is served from your own machine on loopback and shuts down once a key is accepted.</p>
 <form id="f">
  <label for="provider">Provider</label>
  <select id="provider" name="provider">${options}</select>
  <label for="key">API key</label>
  <input id="key" name="key" type="password" autocomplete="off" spellcheck="false" placeholder="sk-..." required>
  <button type="submit" id="btn">Save key</button>
 </form>
 <div id="out" role="status" aria-live="polite"></div>
 <div class="note">Your key is forwarded to OpenCode's credential store. LoopCode does not write it to its own
  config or logs. You can also set an environment variable instead.
  <ul>${links}</ul>
 </div>
</main>
<script>
 const f=document.getElementById('f'),out=document.getElementById('out'),btn=document.getElementById('btn');
 f.addEventListener('submit',async e=>{
  e.preventDefault();btn.disabled=true;out.textContent='Saving…';out.className='';
  try{
   const r=await fetch('/${token}/key',{method:'POST',headers:{'content-type':'application/json'},
     body:JSON.stringify({provider:f.provider.value,key:f.key.value})});
   const j=await r.json();
   if(j.ok){out.textContent='Saved. Return to your terminal.';out.className='ok';f.key.value='';}
   else{out.textContent=j.error||'Failed.';out.className='err';btn.disabled=false;}
  }catch(err){out.textContent='Request failed.';out.className='err';btn.disabled=false;}
 });
</script>
</body></html>`;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}
