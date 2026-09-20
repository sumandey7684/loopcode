import React from 'react';
import { Box, Text } from 'ink';
import type { TaskStateEvent } from '../../../app/events.js';
import { useTheme } from '../../theme-context.js';
import { c } from '../../theme.js';
import { Spinner } from '../Spinner.js';

export function TaskItem({ event, live: _live }: { event: TaskStateEvent; live?: boolean }) {
  const theme = useTheme();
  const glyph =
    event.status === 'running'
      ? null
      : event.status === 'passed'
        ? theme.glyphs.pass
        : event.status === 'failed'
          ? theme.glyphs.fail
          : event.status === 'retrying'
            ? theme.glyphs.warn
            : theme.glyphs.pending;

  const color =
    event.status === 'passed'
      ? c(theme, 'success')
      : event.status === 'failed'
        ? c(theme, 'danger')
        : event.status === 'retrying'
          ? c(theme, 'warning')
          : c(theme, 'accent');

  return (
    <Box marginY={0}>
      <Text color={c(theme, 'muted')}>{theme.glyphs.branch} </Text>
      {glyph ? (
        <Text color={color}>{glyph} </Text>
      ) : (
        <Text color={color}>
          <Spinner />{' '}
        </Text>
      )}
      <Text color={color}>{event.title}</Text>
      {event.durationMs !== undefined ? (
        <Text color={c(theme, 'muted')}> {(event.durationMs / 1000).toFixed(1)}s</Text>
      ) : null}
      {event.costUsd !== undefined && event.costUsd > 0 ? (
        <Text color={c(theme, 'muted')}> (${event.costUsd.toFixed(3)})</Text>
      ) : null}
    </Box>
  );
}
