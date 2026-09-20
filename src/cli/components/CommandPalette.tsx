import React from 'react';
import { Box, Text } from 'ink';
import { filterCommands } from '../commands.js';
import { useTheme } from '../theme-context.js';
import { c } from '../theme.js';

const MAX_VISIBLE = 8;

export function CommandPalette({ query, selectedIndex }: { query: string; selectedIndex: number }) {
  const theme = useTheme();
  const matches = filterCommands(query);
  if (matches.length === 0) {
    return (
      <Box marginTop={0} marginLeft={2}>
        <Text color={c(theme, 'muted')}>No matching command</Text>
      </Box>
    );
  }

  const start = Math.max(0, Math.min(selectedIndex - MAX_VISIBLE + 1, matches.length - MAX_VISIBLE));
  const visible = matches.slice(start, start + MAX_VISIBLE);

  return (
    <Box flexDirection="column" marginLeft={2}>
      {visible.map((spec, i) => {
        const index = start + i;
        const selected = index === selectedIndex;
        return (
          <Box key={spec.name}>
            <Text color={selected ? c(theme, 'accent') : undefined}>
              {selected ? `${theme.glyphs.prompt} ` : '  '}/{spec.name}
              {spec.args ? ` ${spec.args}` : ''}
            </Text>
            <Text color={c(theme, 'muted')}>
              {'  '}
              {spec.summary}
            </Text>
          </Box>
        );
      })}
      {matches.length > MAX_VISIBLE ? (
        <Text color={c(theme, 'muted')} dimColor>
          {'  '}+{matches.length - MAX_VISIBLE} more
        </Text>
      ) : null}
    </Box>
  );
}
