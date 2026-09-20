import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { SessionController } from '../../../app/session-controller.js';
import { useTheme } from '../../theme-context.js';
import { c } from '../../theme.js';

export function WelcomeTrust({
  controller,
  onTrusted,
  onDecline,
}: {
  controller: SessionController;
  onTrusted: () => void;
  onDecline: () => void;
}) {
  const theme = useTheme();
  const [selected, setSelected] = useState<'session' | 'permanent' | 'decline'>('permanent');

  useInput((_input, key) => {
    if (key.upArrow) {
      setSelected((s) => (s === 'decline' ? 'session' : s === 'session' ? 'permanent' : 'permanent'));
    }
    if (key.downArrow) {
      setSelected((s) => (s === 'permanent' ? 'session' : s === 'session' ? 'decline' : 'decline'));
    }
    if (key.return) {
      if (selected === 'decline') {
        onDecline();
      } else {
        controller.trustDirectory(selected);
        onTrusted();
      }
    }
  });

  return (
    <Box flexDirection="column" marginY={1}>
      <Text bold color={c(theme, 'accent')}>
        Welcome to LoopCode
      </Text>
      <Box marginTop={1}>
        <Text color={c(theme, 'muted')}>
          LoopCode is an autonomous engineering agent that reads files, executes shell commands, and modifies your git
          workspace.
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text bold>Do you trust the code in this directory?</Text>
      </Box>
      <Box flexDirection="column" marginTop={1} marginLeft={2}>
        <Text color={selected === 'permanent' ? c(theme, 'accent') : undefined}>
          {selected === 'permanent' ? `${theme.glyphs.prompt} ` : '  '}Yes, trust permanently (saved in config)
        </Text>
        <Text color={selected === 'session' ? c(theme, 'accent') : undefined}>
          {selected === 'session' ? `${theme.glyphs.prompt} ` : '  '}Yes, trust for this session only
        </Text>
        <Text color={selected === 'decline' ? c(theme, 'accent') : undefined}>
          {selected === 'decline' ? `${theme.glyphs.prompt} ` : '  '}No, exit LoopCode
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text color={c(theme, 'muted')}>↑↓ move · enter select</Text>
      </Box>
    </Box>
  );
}
