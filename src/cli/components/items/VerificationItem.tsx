import React from 'react';
import { Box, Text } from 'ink';
import type { VerificationEvent } from '../../../app/events.js';
import { useTheme } from '../../theme-context.js';
import { c } from '../../theme.js';

/**
 * One dense line replaces the old four bordered boxes.
 *   ⎿ ✓ compile 2.1s  ✓ lint 0.8s  ◐ tests  ○ security  ○ review
 */
export function VerificationItem({ event, expanded }: { event: VerificationEvent; expanded: boolean }) {
  const theme = useTheme();

  const glyphFor = (status: string) =>
    status === 'passed'
      ? theme.glyphs.pass
      : status === 'failed'
        ? theme.glyphs.fail
        : status === 'running'
          ? theme.glyphs.running
          : theme.glyphs.pending;

  const colorFor = (status: string) =>
    status === 'passed'
      ? c(theme, 'success')
      : status === 'failed'
        ? c(theme, 'danger')
        : status === 'running'
          ? c(theme, 'accent')
          : c(theme, 'muted');

  const failed = event.layers.filter((l) => l.status === 'failed');

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text color={c(theme, 'accent')}>{theme.glyphs.marker} </Text>
        <Text bold>Verify</Text>
      </Box>
      <Box marginLeft={2}>
        <Text color={c(theme, 'muted')}>{theme.glyphs.branch} </Text>
        {event.layers.map((layer, i) => (
          <Text key={layer.type + i}>
            <Text color={colorFor(layer.status)}>{glyphFor(layer.status)} </Text>
            <Text color={c(theme, 'muted')}>
              {layer.type}
              {layer.durationMs ? ` ${(layer.durationMs / 1000).toFixed(1)}s` : ''}
              {i < event.layers.length - 1 ? '   ' : ''}
            </Text>
          </Text>
        ))}
      </Box>
      {failed.length > 0 ? (
        <Box flexDirection="column" marginLeft={4}>
          {failed.map((layer) => (
            <Text key={layer.type} color={c(theme, 'danger')}>
              {layer.type} failed
              {layer.evidence ? `: ${firstLine(layer.evidence, expanded)}` : ''}
            </Text>
          ))}
          {!expanded ? (
            <Text color={c(theme, 'muted')} dimColor>
              ctrl+o for full output · ctrl+v for the verification panel
            </Text>
          ) : null}
        </Box>
      ) : null}
    </Box>
  );
}

function firstLine(evidence: string, expanded: boolean): string {
  if (expanded) return evidence.trim();
  const line = evidence.split('\n').find((l) => l.trim().length > 0) ?? '';
  return line.length > 100 ? `${line.slice(0, 99)}…` : line;
}
