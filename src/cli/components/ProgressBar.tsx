import React from 'react';
import { Box, Text } from 'ink';

interface ProgressBarProps {
  value: number;
  label: string;
  cost?: number;
}

export function ProgressBar({ value, label, cost }: ProgressBarProps) {
  const width = 30;
  const clampedValue = Math.min(Math.max(value, 0), 1);
  const filled = Math.round(clampedValue * width);
  const empty = width - filled;

  return (
    <Box flexDirection="column" marginY={1}>
      <Text dimColor>{label}</Text>
      <Box flexDirection="row">
        <Text color="cyan">{'█'.repeat(filled)}</Text>
        <Text color="gray">{'░'.repeat(empty)}</Text>
        <Text dimColor> {Math.round(clampedValue * 100)}%</Text>
        {cost !== undefined && <Text color="green"> ${cost.toFixed(4)}</Text>}
      </Box>
    </Box>
  );
}
