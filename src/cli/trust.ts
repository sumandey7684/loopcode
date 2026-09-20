import { isTestEnv } from '../platform/env.js';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const LOOPCODE_DIR = join(homedir(), '.loopcode');
const TRUSTED_DIRS_FILE = join(LOOPCODE_DIR, 'trusted_dirs.json');

interface TrustedDir {
  path: string;
  trustedAt: string;
  permanent: boolean;
}

// Temporary in-memory session trust store
const sessionTrustedDirs = new Set<string>();

export function isWarningDirectory(cwd: string): boolean {
  const warnDirs = [join(homedir(), 'Desktop'), join(homedir(), 'Documents'), join(homedir(), 'Downloads')].map((d) =>
    d.replace(/\\/g, '/').toLowerCase(),
  );

  const normalized = cwd.replace(/\\/g, '/').toLowerCase();
  return warnDirs.some((w) => normalized === w || normalized.startsWith(w + '/'));
}

export function isDangerousDirectory(cwd: string): boolean {
  if (isWarningDirectory(cwd)) {
    return false;
  }

  const dangerous = [
    '/',
    '/usr',
    '/usr/local',
    '/opt',
    '/var',
    '/etc',
    '/bin',
    '/sbin',
    '/System',
    '/Applications',
    'C:\\',
    'C:\\Windows',
  ];

  const normalizedCwd = cwd.replace(/\\/g, '/').toLowerCase();
  const normalizedHome = homedir().replace(/\\/g, '/').toLowerCase();

  if (normalizedCwd === normalizedHome) {
    return true;
  }

  return dangerous.some((d) => {
    const normalizedD = d.replace(/\\/g, '/').toLowerCase();
    return normalizedCwd === normalizedD || normalizedCwd.startsWith(normalizedD + '/');
  });
}

function loadTrustedDirs(): TrustedDir[] {
  try {
    if (!existsSync(TRUSTED_DIRS_FILE)) {
      return [];
    }
    const content = readFileSync(TRUSTED_DIRS_FILE, 'utf-8');
    return JSON.parse(content) as TrustedDir[];
  } catch {
    return [];
  }
}

export function saveTrustedDirs(dirs: TrustedDir[]) {
  try {
    if (!existsSync(LOOPCODE_DIR)) {
      mkdirSync(LOOPCODE_DIR, { recursive: true });
    }
    writeFileSync(TRUSTED_DIRS_FILE, JSON.stringify(dirs, null, 2));
  } catch (err: any) {
    console.error(`Failed to save trusted directories: ${err.message}`);
  }
}

export async function checkTrust(cwd: string): Promise<boolean> {
  if (isTestEnv()) {
    return true; // Auto-pass for tests
  }

  if (isDangerousDirectory(cwd)) {
    console.error('\n⚠️  WARNING: You are about to run LoopCode in a system or home directory.');
    console.error('Running in system locations is highly restricted to prevent unintended modifications. Aborting.');
    process.exit(1);
  }

  // 1. Check in-memory session trust
  if (sessionTrustedDirs.has(cwd)) {
    return true;
  }

  // 2. Check permanent trust
  const trusted = loadTrustedDirs();
  if (trusted.some((t) => cwd.startsWith(t.path))) {
    return true;
  }

  return false;
}
