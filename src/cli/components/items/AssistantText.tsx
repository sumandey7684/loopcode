import React from 'react';
import { Box, Text } from 'ink';
import type { AssistantTextEvent } from '../../../app/events.js';
import { useTheme } from '../../theme-context.js';
import { c } from '../../theme.js';

export function AssistantText({ event }: { event: AssistantTextEvent }) {
  const theme = useTheme();
  return (
    <Box marginY={0}>
      <Text color={c(theme, 'text')}>{event.text}</Text>
    </Box>
  );
}
