import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../theme-context.js';
import { c } from '../theme.js';

export function HintBar({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <Box marginTop={1}>
      <Text color={c(theme, 'muted')} dimColor>
        {text}
      </Text>
    </Box>
  );
}
