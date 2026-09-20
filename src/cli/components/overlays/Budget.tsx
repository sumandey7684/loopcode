import React from 'react';
import { Box, Text } from 'ink';
import type { Snapshot } from '../../../app/session-controller.js';
import { OverlayShell } from './OverlayShell.js';
import { useTheme } from '../../theme-context.js';
import { c } from '../../theme.js';

export function BudgetOverlay({ status }: { status: Snapshot }) {
  const theme = useTheme();

  return (
    <OverlayShell title="Budget & Quota Telemetry" footer="esc close">
      {status.quota ? (
        <Box flexDirection="column">
          <Text bold color={c(theme, 'accent')}>
            Provider Quota
          </Text>
          <Text color={c(theme, 'muted')}>
            Used: {status.quota.used} / {status.quota.limit} (
            {status.quota.limit > 0 ? Math.round((status.quota.used / status.quota.limit) * 100) : 0}%)
          </Text>
          {status.quota.resetsAt ? <Text color={c(theme, 'muted')}>Resets at: {status.quota.resetsAt}</Text> : null}
        </Box>
      ) : (
        <Box flexDirection="column">
          <Text bold color={c(theme, 'accent')}>
            Cost Tracking (USD)
          </Text>
          <Box marginTop={1}>
            <Text color={c(theme, 'muted')}>
              Goal Spend: ${status.goalSpentUsd.toFixed(2)} / ${status.goalLimitUsd.toFixed(2)}
            </Text>
          </Box>
          <Box>
            <Text color={c(theme, 'muted')}>
              Monthly Spend: ${status.monthSpentUsd.toFixed(2)} / ${status.monthLimitUsd.toFixed(2)}
            </Text>
          </Box>
        </Box>
      )}
    </OverlayShell>
  );
}
