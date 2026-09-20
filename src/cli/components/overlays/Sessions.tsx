import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { SessionRecord } from '../../../memory.js';
import { OverlayShell } from './OverlayShell.js';
import { useTheme } from '../../theme-context.js';
import { c } from '../../theme.js';

export function SessionsOverlay({
  sessions,
  onSelect,
  onRename: _onRename,
  onDelete,
  onClose,
}: {
  sessions: SessionRecord[];
  onSelect: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useInput((input, key) => {
    if (key.escape) {
      if (confirmDeleteId) {
        setConfirmDeleteId(null);
        return;
      }
      onClose();
      return;
    }

    if (confirmDeleteId) {
      if (input === 'y' || input === 'Y' || key.return) {
        onDelete(confirmDeleteId);
        setConfirmDeleteId(null);
        setSelectedIndex((idx) => Math.max(0, idx - 1));
      } else if (input === 'n' || input === 'N') {
        setConfirmDeleteId(null);
      }
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((idx) => Math.max(0, idx - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((idx) => Math.min(sessions.length - 1, idx + 1));
      return;
    }

    if (key.return) {
      const selected = sessions[selectedIndex];
      if (selected) onSelect(selected.id);
      return;
    }

    if (input === 'x' || input === 'X') {
      const selected = sessions[selectedIndex];
      if (selected) setConfirmDeleteId(selected.id);
      return;
    }
  });

  return (
    <OverlayShell title="Sessions" footer="↑↓ select · enter open · x delete · esc close">
      {sessions.length === 0 ? (
        <Text color={c(theme, 'muted')}>No saved sessions.</Text>
      ) : (
        <Box flexDirection="column">
          {sessions.map((sess, i) => {
            const selected = i === selectedIndex;
            return (
              <Box key={sess.id} flexDirection="column">
                <Box>
                  <Text color={selected ? c(theme, 'accent') : undefined}>
                    {selected ? `${theme.glyphs.prompt} ` : '  '}
                    {sess.name || sess.id}
                  </Text>
                  <Text color={c(theme, 'muted')}> ({sess.updated_at || sess.created_at})</Text>
                </Box>
                {confirmDeleteId === sess.id ? (
                  <Box marginLeft={4}>
                    <Text color={c(theme, 'danger')} bold>
                      Delete this session? (y/n)
                    </Text>
                  </Box>
                ) : null}
              </Box>
            );
          })}
        </Box>
      )}
    </OverlayShell>
  );
}
