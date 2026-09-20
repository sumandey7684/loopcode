import React from 'react';
import { Box, Text } from 'ink';
import type { DiffEvent } from '../../../app/events.js';
import { useTheme } from '../../theme-context.js';
import { c } from '../../theme.js';

export function DiffItem({ event, expanded }: { event: DiffEvent; expanded: boolean }) {
  const theme = useTheme();
  const patchLines = (event.patch ?? '').split('\n');
  const shown = expanded ? patchLines : patchLines.slice(0, 8);
  const hidden = patchLines.length - shown.length;

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text color={c(theme, 'accent')}>{theme.glyphs.marker} </Text>
        <Text bold>{event.path}</Text>
        <Text color={c(theme, 'success')}> +{event.added}</Text>
        <Text color={c(theme, 'danger')}> -{event.removed}</Text>
      </Box>
      {shown.length > 0 && (expanded || hidden > 0) ? (
        <Box flexDirection="column" marginLeft={2}>
          {shown.map((line, i) => (
            <Text
              key={i}
              color={
                line.startsWith('+')
                  ? c(theme, 'success')
                  : line.startsWith('-')
                    ? c(theme, 'danger')
                    : c(theme, 'muted')
              }
            >
              {line}
            </Text>
          ))}
          {!expanded && hidden > 0 ? (
            <Text color={c(theme, 'muted')} dimColor>
              +{hidden} more lines · ctrl+o to expand
            </Text>
          ) : null}
        </Box>
      ) : null}
    </Box>
  );
}
