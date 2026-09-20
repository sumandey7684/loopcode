import React from 'react';
import { Box, Text } from 'ink';
import type { Snapshot, SessionController } from '../../../app/session-controller.js';
import { OverlayShell } from './OverlayShell.js';
import { useTheme } from '../../theme-context.js';
import { c } from '../../theme.js';

export function ProxyOverlay({
  state,
  controller: _controller,
}: {
  state: Snapshot['proxy'];
  controller: SessionController;
}) {
  const theme = useTheme();

  return (
    <OverlayShell title="Antigravity Proxy Status" footer="esc close">
      <Box flexDirection="column">
        <Box>
          <Text bold>Status: </Text>
          <Text color={state.healthy ? c(theme, 'success') : c(theme, 'danger')}>
            {state.healthy ? `${theme.glyphs.pass} Healthy` : `${theme.glyphs.fail} Offline`}
          </Text>
          {state.port ? <Text color={c(theme, 'muted')}> (Port {state.port})</Text> : null}
        </Box>
        {state.accounts !== undefined ? (
          <Box marginTop={1}>
            <Text color={c(theme, 'muted')}>Accounts linked: {state.accounts}</Text>
          </Box>
        ) : null}
        {state.message ? (
          <Box marginTop={1}>
            <Text color={c(theme, 'muted')}>{state.message}</Text>
          </Box>
        ) : null}
      </Box>
    </OverlayShell>
  );
}
