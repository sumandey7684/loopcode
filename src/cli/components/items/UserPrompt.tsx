import React from 'react';
import { Box, Text } from 'ink';
import type { UserPromptEvent } from '../../../app/events.js';
import { useTheme } from '../../theme-context.js';
import { c } from '../../theme.js';

export function UserPrompt({ event }: { event: UserPromptEvent }) {
  const theme = useTheme();
  return (
    <Box marginTop={1}>
      <Text color={c(theme, 'accent')} bold>
        {theme.glyphs.prompt}{' '}
      </Text>
      <Text bold>{event.text}</Text>
    </Box>
  );
}
