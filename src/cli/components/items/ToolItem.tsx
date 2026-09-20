import React from 'react';
import { Box, Text } from 'ink';
import type { ToolEvent } from '../../../app/events.js';
import { useTheme } from '../../theme-context.js';
import { c } from '../../theme.js';
import { Spinner } from '../Spinner.js';

const MAX_DETAIL_LINES = 4;

export function ToolItem({ event, expanded, live }: { event: ToolEvent; expanded: boolean; live?: boolean }) {
  const theme = useTheme();
  const lines = (event.detail ?? '').split('\n').filter((l) => l.length > 0);
  const shown = expanded ? lines : lines.slice(0, MAX_DETAIL_LINES);
  const hidden = lines.length - shown.length;

  const statusGlyph = event.status === 'running' ? null : event.status === 'ok' ? theme.glyphs.pass : theme.glyphs.fail;
  const statusColor =
    event.status === 'error' ? c(theme, 'danger') : event.status === 'ok' ? c(theme, 'success') : c(theme, 'accent');

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text color={c(theme, 'accent')}>{theme.glyphs.marker} </Text>
        <Text bold>{event.tool}</Text>
        <Text color={c(theme, 'muted')}> {event.summary}</Text>
        {event.durationMs !== undefined ? (
          <Text color={c(theme, 'muted')}> {(event.durationMs / 1000).toFixed(1)}s</Text>
        ) : null}
        {live && event.status === 'running' ? (
          <Text color={c(theme, 'accent')}>
            {'  '}
            <Spinner />
          </Text>
        ) : statusGlyph ? (
          <Text color={statusColor}>
            {'  '}
            {statusGlyph}
          </Text>
        ) : null}
      </Box>
      {shown.length > 0 ? (
        <Box flexDirection="column" marginLeft={2}>
          {shown.map((line, i) => (
            <Text key={i} color={c(theme, 'muted')}>
              {i === 0 ? `${theme.glyphs.branch} ` : '  '}
              {line}
            </Text>
          ))}
          {hidden > 0 ? (
            <Text color={c(theme, 'muted')} dimColor>
              {'  '}+{hidden} more line{hidden === 1 ? '' : 's'} · ctrl+o to expand
            </Text>
          ) : null}
        </Box>
      ) : null}
    </Box>
  );
}
