import { describe, it, expect } from 'bun:test';
import { redact, maskKey, redactObject } from '../src/app/redact.js';

describe('redact', () => {
  it('redacts Anthropic API keys', () => {
    const input = 'key sk-ant-api03-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    expect(redact(input)).toBe('key «redacted»');
  });

  it('redacts OpenAI keys', () => {
    const input = 'bearer sk-proj-1234567890abcdef12345678';
    expect(redact(input)).toBe('bearer «redacted»');
  });

  it('redacts Google API keys', () => {
    const input = 'key AIzaSyD1234567890abcdefghijklmnopqrstuvwx';
    expect(redact(input)).toBe('key «redacted»');
  });

  it('redacts generic assignment keys', () => {
    const input = 'API_KEY="my_super_secret_token_12345"';
    expect(redact(input)).toContain('API_KEY=«redacted»');
  });

  it('masks keys for UI display keeping short prefix', () => {
    expect(maskKey('sk-ant-1234567890')).toBe('sk-ant-••••••••••');
    expect(maskKey('short')).toBe('•••••');
  });

  it('redacts secrets inside nested objects', () => {
    const obj = { token: 'sk-ant-api03-123456789012345678', user: 'alice' };
    const safe = redactObject(obj);
    expect(safe.token).not.toContain('sk-ant');
    expect(safe.user).toBe('alice');
  });
});
