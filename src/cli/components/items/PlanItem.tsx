import React from 'react';
import { Box, Text } from 'ink';
import type { PlanEvent } from '../../../app/events.js';
import { useTheme } from '../../theme-context.js';
import { c } from '../../theme.js';

export function PlanItem({ event, expanded: _expanded }: { event: PlanEvent; expanded?: boolean }) {
  const theme = useTheme();
  const allTasks = (event.batches ?? []).flat();

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text color={c(theme, 'accent')}>{theme.glyphs.marker} </Text>
        <Text bold>Plan ({allTasks.length} tasks)</Text>
      </Box>
      <Box flexDirection="column" marginLeft={2}>
        {allTasks.map((task, i) => (
          <Box key={task.id || i}>
            <Text color={c(theme, 'muted')}>
              {theme.glyphs.branch} {i + 1}. {task.description}
            </Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
