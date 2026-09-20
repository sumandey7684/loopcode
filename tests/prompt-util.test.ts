import { describe, it, expect } from 'bun:test';
import { squashPrompt } from '../src/cli/prompt-util.js';

describe('Prompt Squashing Utility', () => {
  it('does not squash short prompts (<= 5 lines)', () => {
    const shortPrompt = 'line 1\nline 2\nline 3';
    expect(squashPrompt(shortPrompt)).toBe(shortPrompt);
  });

  it('squashes long prompts (> 5 lines)', () => {
    const longPrompt = 'line 1\nline 2\nline 3\nline 4\nline 5\nline 6';
    const squashed = squashPrompt(longPrompt);
    expect(squashed).toContain('line 1');
    expect(squashed).toContain('+ 4 lines...');
    expect(squashed).toContain('line 6');
    expect(squashed.split('\n').length).toBe(3);
  });
});
