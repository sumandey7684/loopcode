import React from 'react';
import { Box, Text } from 'ink';
import type { TaskSnapshot } from '../../../app/session-controller.js';
import { OverlayShell } from './OverlayShell.js';
import { useTheme } from '../../theme-context.js';
import { c } from '../../theme.js';

export function TasksOverlay({ tasks }: { tasks: TaskSnapshot[] }) {
  const theme = useTheme();

  return (
    <OverlayShell title="Task Execution Graph" footer="esc close">
      {tasks.length === 0 ? (
        <Text color={c(theme, 'muted')}>No active tasks.</Text>
      ) : (
        <Box flexDirection="column">
          {tasks.map((task) => (
            <Box key={task.id}>
              <Text color={c(theme, 'accent')}>{task.batchIndex + 1}. </Text>
              <Text bold>{task.title}</Text>
              <Text color={c(theme, 'muted')}> [{task.status}]</Text>
              {task.model ? <Text color={c(theme, 'muted')}> ({task.model})</Text> : null}
            </Box>
          ))}
        </Box>
      )}
    </OverlayShell>
  );
}
