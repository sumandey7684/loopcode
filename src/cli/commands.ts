export interface CommandSpec {
  name: string;
  args?: string;
  summary: string;
  /** Grouping in the help overlay. */
  group: 'session' | 'model' | 'auth' | 'proxy' | 'run' | 'view' | 'meta';
}

/** Single source of truth for slash commands, palette entries and /help. */
export const COMMANDS: CommandSpec[] = [
  { name: 'help', summary: 'Show all commands and keybindings', group: 'meta' },
  { name: 'login', args: '[provider]', summary: 'Connect a provider (API key or OAuth)', group: 'auth' },
  { name: 'logout', args: '<provider>', summary: 'Remove stored credentials for a provider', group: 'auth' },
  { name: 'auth', args: 'status|cli|web', summary: 'Auth status, external CLI, or loopback page', group: 'auth' },
  { name: 'model', args: '[role]', summary: 'Choose the model for a role', group: 'model' },
  { name: 'models', summary: 'List available models from connected providers', group: 'model' },
  { name: 'provider', summary: 'Switch active provider', group: 'model' },
  { name: 'proxy', args: 'enable|disable|status|start|stop', summary: 'Manage the Antigravity proxy', group: 'proxy' },
  { name: 'mode', args: '[plan|acceptEdits|auto]', summary: 'Set the permission mode', group: 'run' },
  { name: 'run', args: '<goal>', summary: 'Start a goal explicitly', group: 'run' },
  { name: 'stop', summary: 'Interrupt the current run', group: 'run' },
  { name: 'resume', args: '[taskId]', summary: 'Resume an interrupted goal', group: 'session' },
  { name: 'sessions', summary: 'Open the session picker', group: 'session' },
  { name: 'rename', args: '<name>', summary: 'Rename the current session', group: 'session' },
  { name: 'pause', summary: 'Pause and exit, keeping state', group: 'session' },
  { name: 'tasks', summary: 'Show the task DAG', group: 'view' },
  { name: 'verify', summary: 'Show verification detail', group: 'view' },
  { name: 'cost', summary: 'Show spend or quota detail', group: 'view' },
  { name: 'diff', summary: 'Show the working-tree diff', group: 'view' },
  { name: 'undo', summary: 'Undo the last LoopCode commit (soft reset)', group: 'view' },
  { name: 'clear', summary: 'Clear the transcript view', group: 'view' },
  { name: 'config', summary: 'Show resolved configuration and its source', group: 'meta' },
  { name: 'doctor', summary: 'Diagnose environment, auth, proxy and tooling', group: 'meta' },
  { name: 'terminal-setup', summary: 'Configure terminal keybindings', group: 'meta' },
  { name: 'exit', summary: 'Quit LoopCode', group: 'meta' },
];

/** Subsequence fuzzy match, ranked by match tightness then name length. */
export function filterCommands(query: string): CommandSpec[] {
  const q = query.replace(/^\//, '').trim().toLowerCase();
  if (!q) return COMMANDS;

  const scored: Array<{ spec: CommandSpec; score: number }> = [];
  for (const spec of COMMANDS) {
    const name = spec.name.toLowerCase();
    if (name.startsWith(q)) {
      scored.push({ spec, score: 0 });
      continue;
    }
    let qi = 0;
    let gaps = 0;
    let lastHit = -1;
    for (let i = 0; i < name.length && qi < q.length; i += 1) {
      if (name[i] === q[qi]) {
        if (lastHit >= 0) gaps += i - lastHit - 1;
        lastHit = i;
        qi += 1;
      }
    }
    if (qi === q.length) scored.push({ spec, score: 1 + gaps });
    else if (spec.summary.toLowerCase().includes(q)) scored.push({ spec, score: 50 });
  }

  return scored.sort((a, b) => a.score - b.score || a.spec.name.length - b.spec.name.length).map((s) => s.spec);
}
