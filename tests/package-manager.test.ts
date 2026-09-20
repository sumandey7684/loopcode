import { describe, it, expect } from 'bun:test';
import { detectPackageManager, resolveProjectCommands } from '../src/platform/package-manager.js';

describe('package-manager', () => {
  it('detects bun for this repository', () => {
    const manager = detectPackageManager(process.cwd());
    expect(manager).toBe('bun');
  });

  it('resolves project commands for this repository', () => {
    const commands = resolveProjectCommands(process.cwd());
    expect(commands.manager).toBe('bun');
    expect(commands.test).toEqual(['bun', 'run', 'test']);
    expect(commands.lint).toEqual(['bun', 'run', 'lint']);
    expect(commands.build).toEqual(['bun', 'run', 'build']);
  });

  it('falls back to npm for empty directory', () => {
    const manager = detectPackageManager('/tmp');
    expect(manager).toBe('npm');
  });
});
