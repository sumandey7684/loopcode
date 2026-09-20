import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../theme-context.js';
import { c } from '../../theme.js';

export function OverlayShell({ title, footer, children }: React.PropsWithChildren<{ title: string; footer?: string }>) {
  const theme = useTheme();
  const columns = process.stdout.columns || 80;
  // Clamp so we never render off-screen on narrow terminals (old bug).
  const width = Math.max(40, Math.min(columns - 4, 96));

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={c(theme, 'accent')}
      paddingX={1}
      width={width}
      marginTop={1}
    >
      <Text bold color={c(theme, 'accent')}>
        {title}
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {children}
      </Box>
      {footer ? (
        <Box marginTop={1}>
          <Text color={c(theme, 'muted')}>{footer}</Text>
        </Box>
      ) : null}
    </Box>
  );
}
