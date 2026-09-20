import { configStore } from '../config/store.js';

export const ANTIGRAVITY_RISK_TEXT = [
  'The Antigravity proxy is an unofficial tool that is not affiliated with, endorsed by,',
  'or supported by Google or Anthropic.',
  '',
  "Using it may violate Google's Terms of Service. Users have reported Google accounts",
  'being suspended, banned, or restricted without notice.',
  '',
  'If you continue:',
  '  • You accept that your Google account may be permanently banned.',
  '  • You accept all legal, financial and technical risk.',
  '  • You should use a secondary account, not your primary one.',
  '',
  'LoopCode does not install or operate this proxy for you; it only manages a proxy',
  'you choose to run on your own machine.',
].join('\n');

export function hasAcceptedRisk(): boolean {
  return Boolean(configStore.get().proxy.riskAcceptedAt);
}

export function acceptRisk(): void {
  configStore.save({
    proxy: { ...configStore.get().proxy, riskAcceptedAt: new Date().toISOString() },
  });
}

export function revokeRisk(): void {
  configStore.save({
    proxy: { ...configStore.get().proxy, riskAcceptedAt: '', enabled: false },
  });
}
