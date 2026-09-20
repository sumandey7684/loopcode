import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useTheme } from '../theme-context.js';
import { c } from '../theme.js';
import { resolve, type Context } from '../keys.js';

export interface ComposerProps {
  onSubmit: (text: string) => void;
  onAction: (action: string) => void;
  /** Called on every change so the parent can drive / and @ autocomplete. */
  onChange?: (text: string, cursor: { row: number; col: number }) => void;
  placeholder?: string;
  context: Context;
  isActive: boolean;
  history: string[];
}

interface Buffer {
  lines: string[];
  row: number;
  col: number;
}

const EMPTY: Buffer = { lines: [''], row: 0, col: 0 };

function textOf(buf: Buffer): string {
  return buf.lines.join('\n');
}

function fromText(text: string): Buffer {
  const lines = text.split('\n');
  return { lines, row: lines.length - 1, col: lines[lines.length - 1].length };
}

function insert(buf: Buffer, chunk: string): Buffer {
  const lines = [...buf.lines];
  const current = lines[buf.row];
  const before = current.slice(0, buf.col);
  const after = current.slice(buf.col);

  // Multi-line paste
  if (chunk.includes('\n') || chunk.includes('\r')) {
    const pasted = chunk.replace(/\r\n?/g, '\n').split('\n');
    const first = before + pasted[0];
    const last = pasted[pasted.length - 1] + after;
    const middle = pasted.slice(1, -1);
    lines.splice(buf.row, 1, first, ...middle, last);
    const newRow = buf.row + pasted.length - 1;
    return { lines, row: newRow, col: pasted[pasted.length - 1].length };
  }

  lines[buf.row] = before + chunk + after;
  return { lines, row: buf.row, col: buf.col + chunk.length };
}

function deleteBack(buf: Buffer): Buffer {
  const lines = [...buf.lines];
  if (buf.col > 0) {
    lines[buf.row] = lines[buf.row].slice(0, buf.col - 1) + lines[buf.row].slice(buf.col);
    return { lines, row: buf.row, col: buf.col - 1 };
  }
  if (buf.row === 0) return buf;
  const prev = lines[buf.row - 1];
  const merged = prev + lines[buf.row];
  lines.splice(buf.row - 1, 2, merged);
  return { lines, row: buf.row - 1, col: prev.length };
}

function deleteForward(buf: Buffer): Buffer {
  const lines = [...buf.lines];
  const current = lines[buf.row];
  if (buf.col < current.length) {
    lines[buf.row] = current.slice(0, buf.col) + current.slice(buf.col + 1);
    return { lines, row: buf.row, col: buf.col };
  }
  if (buf.row >= lines.length - 1) return buf;
  lines.splice(buf.row, 2, current + lines[buf.row + 1]);
  return { lines, row: buf.row, col: buf.col };
}

function wordLeft(buf: Buffer): number {
  const line = buf.lines[buf.row];
  let i = buf.col;
  while (i > 0 && /\s/.test(line[i - 1])) i -= 1;
  while (i > 0 && !/\s/.test(line[i - 1])) i -= 1;
  return i;
}

function wordRight(buf: Buffer): number {
  const line = buf.lines[buf.row];
  let i = buf.col;
  while (i < line.length && !/\s/.test(line[i])) i += 1;
  while (i < line.length && /\s/.test(line[i])) i += 1;
  return i;
}

export function Composer({
  onSubmit,
  onAction,
  onChange,
  placeholder = 'Describe a goal, or / for commands',
  context,
  isActive,
  history,
}: ComposerProps) {
  const theme = useTheme();
  const [buf, setBuf] = useState<Buffer>(EMPTY);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [draft, setDraft] = useState('');

  const text = useMemo(() => textOf(buf), [buf]);
  const isEmpty = text.length === 0;

  const update = (next: Buffer) => {
    setBuf(next);
    onChange?.(textOf(next), { row: next.row, col: next.col });
  };

  useInput(
    (input, key) => {
      const { action, insert: chunk } = resolve(input, key, {
        context,
        inputEmpty: isEmpty,
        hasOverlay: false,
      });

      switch (action) {
        case 'submit': {
          const value = text.trim();
          if (!value) return;
          onSubmit(value);
          setBuf(EMPTY);
          setHistoryIndex(-1);
          setDraft('');
          return;
        }
        case 'newline':
          update(insert(buf, '\n'));
          return;
        case 'delete-back':
          update(deleteBack(buf));
          return;
        case 'delete-forward':
          update(deleteForward(buf));
          return;
        case 'delete-word': {
          const target = wordLeft(buf);
          const lines = [...buf.lines];
          lines[buf.row] = lines[buf.row].slice(0, target) + lines[buf.row].slice(buf.col);
          update({ lines, row: buf.row, col: target });
          return;
        }
        case 'delete-to-start': {
          const lines = [...buf.lines];
          lines[buf.row] = lines[buf.row].slice(buf.col);
          update({ lines, row: buf.row, col: 0 });
          return;
        }
        case 'delete-to-end': {
          const lines = [...buf.lines];
          lines[buf.row] = lines[buf.row].slice(0, buf.col);
          update({ lines, row: buf.row, col: buf.col });
          return;
        }
        case 'cursor-left':
          if (buf.col > 0) update({ ...buf, col: buf.col - 1 });
          else if (buf.row > 0) update({ ...buf, row: buf.row - 1, col: buf.lines[buf.row - 1].length });
          return;
        case 'cursor-right':
          if (buf.col < buf.lines[buf.row].length) update({ ...buf, col: buf.col + 1 });
          else if (buf.row < buf.lines.length - 1) update({ ...buf, row: buf.row + 1, col: 0 });
          return;
        case 'cursor-word-left':
          update({ ...buf, col: wordLeft(buf) });
          return;
        case 'cursor-word-right':
          update({ ...buf, col: wordRight(buf) });
          return;
        case 'cursor-home':
          update({ ...buf, col: 0 });
          return;
        case 'cursor-end':
          update({ ...buf, col: buf.lines[buf.row].length });
          return;
        case 'history-prev': {
          if (history.length === 0) return;
          if (historyIndex === -1) {
            setDraft(text);
            const idx = history.length - 1;
            setHistoryIndex(idx);
            update(fromText(history[idx]));
          } else if (historyIndex > 0) {
            const idx = historyIndex - 1;
            setHistoryIndex(idx);
            update(fromText(history[idx]));
          }
          return;
        }
        case 'history-next': {
          if (historyIndex === -1) return;
          if (historyIndex < history.length - 1) {
            const idx = historyIndex + 1;
            setHistoryIndex(idx);
            update(fromText(history[idx]));
          } else {
            setHistoryIndex(-1);
            update(fromText(draft));
          }
          return;
        }
        case 'clear-input':
          if (!isEmpty) update(EMPTY);
          else onAction('clear-input');
          return;
        case null:
          if (chunk) update(insert(buf, chunk));
          return;
        default:
          if (action) onAction(action);
      }
    },
    { isActive },
  );

  const line = buf.lines[buf.row] ?? '';
  const before = line.slice(0, buf.col);
  const at = line.slice(buf.col, buf.col + 1) || ' ';
  const after = line.slice(buf.col + 1);

  return (
    <Box borderStyle="round" borderColor={c(theme, 'accent')} paddingX={1} flexDirection="column">
      {buf.lines.map((l, i) => {
        if (i !== buf.row) {
          return (
            <Box key={i}>
              <Text color={c(theme, 'accent')}>{i === 0 ? `${theme.glyphs.prompt} ` : '  '}</Text>
              <Text>{l}</Text>
            </Box>
          );
        }
        return (
          <Box key={i}>
            <Text color={c(theme, 'accent')}>{i === 0 ? `${theme.glyphs.prompt} ` : '  '}</Text>
            {isEmpty ? (
              <>
                <Text inverse> </Text>
                <Text color={c(theme, 'muted')}>{placeholder}</Text>
              </>
            ) : (
              <>
                <Text>{before}</Text>
                <Text inverse>{at}</Text>
                <Text>{after}</Text>
              </>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
