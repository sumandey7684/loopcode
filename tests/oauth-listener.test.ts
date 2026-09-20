import { describe, it, expect } from 'bun:test';
import { startLoopbackListener } from '../src/auth/oauth-listener.js';

describe('oauth-listener', () => {
  it('binds 127.0.0.1 and resolves with code for matching state', async () => {
    const listener = await startLoopbackListener({ preferredPort: 51121, timeoutMs: 5000 });
    expect(listener.redirectUri).toContain('http://127.0.0.1:');
    expect(listener.state).toBeTruthy();

    const resPromise = listener.wait;

    // Send valid callback
    const res = await fetch(`${listener.redirectUri}?code=authcode123&state=${listener.state}`);
    expect(res.status).toBe(200);

    const captured = await resPromise;
    expect(captured.code).toBe('authcode123');
    expect(captured.state).toBe(listener.state);

    listener.close();
  });

  it('responds 400 for a mismatched state', async () => {
    const listener = await startLoopbackListener({ preferredPort: 51122, timeoutMs: 5000 });
    const res = await fetch(`${listener.redirectUri}?code=authcode123&state=wrongstate`);
    expect(res.status).toBe(400);
    listener.close();
  });

  it('responds 404 for a path other than callback path', async () => {
    const listener = await startLoopbackListener({ preferredPort: 51123, timeoutMs: 5000 });
    const url = new URL(listener.redirectUri);
    const res = await fetch(`http://127.0.0.1:${url.port}/other-path`);
    expect(res.status).toBe(404);
    listener.close();
  });
});
