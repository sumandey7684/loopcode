import { getPermissionMode } from './state.js';

export function isCommandDestructive(command: string): boolean {
  const destructiveKeywords = [
    'rm ',
    'rmdir',
    'mkfs',
    'dd ',
    'git push --force',
    'git push -f',
    'git reset --hard',
    'git clean -f',
    'git clean -fd',
  ];
  const normalized = command.toLowerCase().trim();
  return destructiveKeywords.some((keyword) => normalized.includes(keyword));
}

export async function approveShellCommand(command: string, isDestructive = false): Promise<'yes' | 'always' | 'no'> {
  const actualDestructive = isDestructive || isCommandDestructive(command);

  // If not destructive and mode is auto, automatically approve
  if (!actualDestructive && getPermissionMode() === 'auto') {
    return 'yes';
  }

  // If in acceptEdits mode, non-destructive is approved, but destructive requires prompt
  if (getPermissionMode() === 'acceptEdits' && !actualDestructive) {
    return 'yes';
  }

  return 'no';
}

export async function approveFileEdit(_filePath: string, _diff: string): Promise<boolean> {
  if (getPermissionMode() === 'auto' || getPermissionMode() === 'acceptEdits') {
    return true;
  }
  return false;
}
