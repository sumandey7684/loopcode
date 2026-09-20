import React from 'react';
import { Box, Text } from 'ink';
import type { AppEvent } from '../../../app/events.js';
import { useTheme } from '../../theme-context.js';
import { c } from '../../theme.js';
import { UserPrompt } from './UserPrompt.js';
import { AssistantText } from './AssistantText.js';
import { PlanItem } from './PlanItem.js';
import { TaskItem } from './TaskItem.js';
import { ToolItem } from './ToolItem.js';
import { DiffItem } from './DiffItem.js';
import { VerificationItem } from './VerificationItem.js';

interface Props {
  event: AppEvent;
  expanded: boolean;
  live?: boolean;
}

export function TranscriptItem({ event, expanded, live = false }: Props) {
  const theme = useTheme();

  switch (event.kind) {
    case 'user-prompt':
      return <UserPrompt event={event} />;
    case 'assistant-text':
      return <AssistantText event={event} />;
    case 'thinking':
      return (
        <Box marginY={0}>
          <Text color={c(theme, 'muted')} italic>
            {theme.glyphs.branch} {truncate(event.text, 120)}
          </Text>
        </Box>
      );
    case 'plan':
      return <PlanItem event={event} expanded={expanded} />;
    case 'task-state':
      return <TaskItem event={event} live={live} />;
    case 'tool':
      return <ToolItem event={event} expanded={expanded} live={live} />;
    case 'diff':
      return <DiffItem event={event} expanded={expanded} />;
    case 'verification':
      return <VerificationItem event={event} expanded={expanded} />;
    case 'phase':
      return (
        <Box marginTop={1}>
          <Text color={c(theme, 'accent')} bold>
            {theme.glyphs.marker} {label(event.phase)}
          </Text>
          {event.detail ? (
            <Text color={c(theme, 'muted')}>
              {'  '}
              {event.detail}
            </Text>
          ) : null}
        </Box>
      );
    case 'notice':
      return (
        <Box>
          <Text
            color={
              event.level === 'error'
                ? c(theme, 'danger')
                : event.level === 'warn'
                  ? c(theme, 'warning')
                  : event.level === 'success'
                    ? c(theme, 'success')
                    : c(theme, 'muted')
            }
          >
            {event.level === 'error'
              ? theme.glyphs.fail
              : event.level === 'warn'
                ? theme.glyphs.warn
                : event.level === 'success'
                  ? theme.glyphs.pass
                  : theme.glyphs.bullet}{' '}
            {event.text}
          </Text>
        </Box>
      );
    default:
      return null;
  }
}

function label(phase: string): string {
  return phase.charAt(0).toUpperCase() + phase.slice(1);
}

function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
