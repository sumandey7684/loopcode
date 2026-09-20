/**
 * Redact credential-shaped substrings before anything is displayed, logged or
 * persisted. Deliberately conservative: false positives are harmless here.
 */

const PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\bsk-ant-[A-Za-z0-9_-]{16,}\b/g, label: 'anthropic-key' },
  { re: /\bsk-proj-[A-Za-z0-9_-]{16,}\b/g, label: 'openai-project-key' },
  { re: /\bsk-[A-Za-z0-9]{20,}\b/g, label: 'openai-key' },
  { re: /\bAIza[0-9A-Za-z_-]{30,}\b/g, label: 'google-key' },
  { re: /\bgh[pousr]_[A-Za-z0-9]{16,}\b/g, label: 'github-token' },
  { re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, label: 'slack-token' },
  { re: /\bya29\.[A-Za-z0-9._-]{20,}\b/g, label: 'google-oauth-access' },
  { re: /\b1\/\/[A-Za-z0-9._-]{20,}\b/g, label: 'google-oauth-refresh' },
  { re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, label: 'jwt' },
  // Generic assignments: API_KEY=..., "token": "...", password: '...'
  {
    re: /\b((?:api[_-]?key|secret|token|password|passwd|authorization|bearer)\s*[=:]\s*)["']?([A-Za-z0-9._\-/+]{12,})["']?/gi,
    label: 'assigned-secret',
  },
];

export function redact(input: string): string {
  if (!input) return input;
  let out = input;
  for (const { re } of PATTERNS) {
    out = out.replace(re, (match, prefix?: string) =>
      typeof prefix === 'string' ? `${prefix}«redacted»` : '«redacted»',
    );
  }
  return out;
}

/** Mask for display while typing: keep a short prefix, hide the rest. */
export function maskKey(key: string, visible = 7): string {
  if (!key) return '';
  if (key.length <= visible) return '•'.repeat(key.length);
  return key.slice(0, visible) + '•'.repeat(Math.min(32, key.length - visible));
}

export function redactObject<T>(value: T): T {
  return JSON.parse(redact(JSON.stringify(value))) as T;
}
