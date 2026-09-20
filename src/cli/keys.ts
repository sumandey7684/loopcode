import type { Key } from 'ink';

export type Context = 'input' | 'overlay' | 'dialog' | 'working';

export type Action =
  | 'submit'
  | 'newline'
  | 'interrupt'
  | 'exit'
  | 'close'
  | 'clear-input'
  | 'clear-view'
  | 'cycle-mode'
  | 'open-commands'
  | 'open-tasks'
  | 'open-verification'
  | 'open-budget'
  | 'open-sessions'
  | 'open-help'
  | 'expand-last'
  | 'history-prev'
  | 'history-next'
  | 'history-search'
  | 'cursor-left'
  | 'cursor-right'
  | 'cursor-word-left'
  | 'cursor-word-right'
  | 'cursor-home'
  | 'cursor-end'
  | 'delete-back'
  | 'delete-forward'
  | 'delete-word'
  | 'delete-to-start'
  | 'delete-to-end'
  | 'select-prev'
  | 'select-next'
  | 'confirm';

export interface Resolution {
  action: Action | null;
  /** Raw text to insert, when the key is ordinary input. */
  insert?: string;
}

/**
 * Map a keypress to an action.
 *
 * Deliberate omissions:
 *  - Ctrl+M is NOT bound: in most terminals it is carriage return.
 *  - Ctrl+D only exits from an empty input, never mid-text.
 *  - Destructive actions are never single unmodified letters in global context.
 */
export function resolve(
  input: string,
  key: Key,
  ctx: { context: Context; inputEmpty: boolean; hasOverlay: boolean },
): Resolution {
  // ── Overlay / dialog first: Esc must always back out. ─────────────────────
  if (ctx.hasOverlay || ctx.context === 'overlay' || ctx.context === 'dialog') {
    if (key.escape) return { action: 'close' };
    if (key.return) return { action: 'confirm' };
    if (key.upArrow) return { action: 'select-prev' };
    if (key.downArrow) return { action: 'select-next' };
  }

  // ── Global chords ────────────────────────────────────────────────────────
  if (key.ctrl) {
    switch (input) {
      case 'c':
        return { action: 'interrupt' };
      case 'd':
        return ctx.inputEmpty ? { action: 'exit' } : { action: null };
      case 'l':
        return { action: 'clear-view' };
      case 't':
        return { action: 'open-tasks' };
      case 'v':
        return { action: 'open-verification' };
      case 'b':
        return { action: 'open-budget' };
      case 's':
        return { action: 'open-sessions' };
      case 'o':
        return { action: 'expand-last' };
      case 'r':
        return { action: 'history-search' };
      case 'j':
        return { action: 'newline' };
      case 'w':
        return { action: 'delete-word' };
      case 'u':
        return { action: 'delete-to-start' };
      case 'k':
        return { action: 'delete-to-end' };
      case 'a':
        return { action: 'cursor-home' };
      case 'e':
        return { action: 'cursor-end' };
      default:
        return { action: null };
    }
  }

  if (key.shift && key.tab) return { action: 'cycle-mode' };

  // ── Working state: Esc interrupts. ───────────────────────────────────────
  if (key.escape) {
    if (ctx.context === 'working') return { action: 'interrupt' };
    return { action: 'clear-input' };
  }

  // ── Input editing ────────────────────────────────────────────────────────
  if (key.return) return key.shift ? { action: 'newline' } : { action: 'submit' };
  if (key.leftArrow) return { action: key.meta ? 'cursor-word-left' : 'cursor-left' };
  if (key.rightArrow) return { action: key.meta ? 'cursor-word-right' : 'cursor-right' };
  if (key.upArrow) return { action: 'history-prev' };
  if (key.downArrow) return { action: 'history-next' };
  if (key.backspace) return { action: 'delete-back' };
  if (key.delete) return { action: 'delete-forward' };

  if (input && !key.meta) return { action: null, insert: input };
  return { action: null };
}

/** Rendered in the hint bar; single source of truth for what we advertise. */
export const HINTS: Record<string, string> = {
  idle: '/ commands · @ files · shift+tab mode · ctrl+t tasks · ctrl+s sessions',
  working: 'esc interrupt · ctrl+t tasks · ctrl+v verification · ctrl+o expand',
  overlay: '↑↓ move · enter select · esc close',
  onboarding: '↑↓ select · enter confirm · esc back',
};
