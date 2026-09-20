import React from 'react';
import { Box, Text } from 'ink';
import { COMMANDS } from '../../commands.js';
import { OverlayShell } from './OverlayShell.js';
import { useTheme } from '../../theme-context.js';
import { c } from '../../theme.js';

export function HelpOverlay() {
  const theme = useTheme();

  return (
    <OverlayShell title="Help & Shortcuts" footer="esc close">
      <Box flexDirection="column">
        <Text bold color={c(theme, 'accent')}>
          Keybindings
        </Text>
        <Text color={c(theme, 'muted')}>
          Ctrl+C interrupt run · Ctrl+T tasks · Ctrl+V verification · Ctrl+B budget · Ctrl+S sessions · Ctrl+O expand
        </Text>
        <Text color={c(theme, 'muted')}>Shift+Tab cycle permission mode · Esc close / clear</Text>

        <Box marginTop={1} flexDirection="column">
          <Text bold color={c(theme, 'accent')}>
            Slash Commands
          </Text>
          {COMMANDS.map((cmd) => (
            <Box key={cmd.name}>
              <Text bold>/{cmd.name}</Text>
              {cmd.args ? <Text color={c(theme, 'accent')}> {cmd.args}</Text> : null}
              <Text color={c(theme, 'muted')}> — {cmd.summary}</Text>
            </Box>
          ))}
        </Box>
      </Box>
    </OverlayShell>
  );
}
