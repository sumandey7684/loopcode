import { describe, it, expect } from 'bun:test';
import { Classifier } from '../src/classifier.js';

process.env.VITEST = '1';

describe('Classifier', () => {
  it('correctly classifies typo fix as single_agent using Tier 1 rules', () => {
    const result = Classifier.classifyGoal('Fix typo in config comment');
    expect(result.path).toBe('single_agent');
    expect(result.recommendedModel).toBe('gemini-3.5-flash');
    expect(result.confidence).toBe(0.9);
  });

  it('correctly classifies auth implementation as full_loop using Tier 1 rules', () => {
    const result = Classifier.classifyGoal('Implement auth endpoints and tokens');
    expect(result.path).toBe('full_loop');
    expect(result.recommendedModel).toBe('claude-4.8-opus');
  });

  it('classifies simple file modification as single_agent under Tier 2 heuristics', () => {
    const result = Classifier.classifyGoal('Update variable naming', { estimatedFilesAffected: 1 });
    expect(result.path).toBe('single_agent');
    expect(result.recommendedModel).toBe('claude-5-sonnet');
    expect(result.confidence).toBe(0.75);
  });

  it('defaults to full_loop for unknown complex instructions', () => {
    const result = Classifier.classifyGoal('Optimize all database operations and profile them');
    expect(result.path).toBe('full_loop');
    expect(result.recommendedModel).toBe('claude-4.8-opus');
  });
});
