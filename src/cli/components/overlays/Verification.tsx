import React from 'react';
import { Box, Text } from 'ink';
import type { VerificationSnapshot } from '../../../app/session-controller.js';
import { OverlayShell } from './OverlayShell.js';
import { useTheme } from '../../theme-context.js';
import { c } from '../../theme.js';

export function VerificationOverlay({ reports }: { reports: VerificationSnapshot[] }) {
  const theme = useTheme();

  return (
    <OverlayShell title="Verification Detail" footer="esc close">
      {reports.length === 0 ? (
        <Text color={c(theme, 'muted')}>No verification reports recorded yet.</Text>
      ) : (
        <Box flexDirection="column">
          {reports.map((rep) => (
            <Box key={rep.taskId} flexDirection="column" marginBottom={1}>
              <Text bold color={c(theme, 'accent')}>
                Task {rep.taskId} — {rep.overallPass ? 'PASSED' : rep.overallPass === false ? 'FAILED' : 'RUNNING'}
              </Text>
              {rep.layers.map((layer) => (
                <Box key={layer.name} marginLeft={2}>
                  <Text color={layer.status === 'passed' ? c(theme, 'success') : c(theme, 'danger')}>
                    {layer.status === 'passed' ? theme.glyphs.pass : theme.glyphs.fail} {layer.name} ({layer.type})
                  </Text>
                  {layer.evidence ? <Text color={c(theme, 'muted')}> - {layer.evidence.slice(0, 80)}</Text> : null}
                </Box>
              ))}
            </Box>
          ))}
        </Box>
      )}
    </OverlayShell>
  );
}
