import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { Spinner } from './Spinner.js';
import { useTheme } from '../theme-context.js';
import { c } from '../theme.js';

export interface LiveStatusProps {
  active: boolean;
  phase: string;
  detail?: string;
  startedAt?: number;
  cost?: { spentUsd: number; limitUsd: number } | null;
  quota?: { used: number; limit: number; resetsAt?: string } | null;
  interruptible: boolean;
}

/**
 * The only animated chrome. Renders nothing when idle — that is the point.
 */
export function LiveStatus({ active, phase, detail, startedAt, cost, quota, interruptible }: LiveStatusProps) {
  const theme = useTheme();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);

  if (!active) return null;

  const elapsed = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
  const parts: string[] = [phase];
  if (detail) parts.push(detail);
  parts.push(`${elapsed}s`);

  if (quota) {
    const pct = quota.limit > 0 ? Math.round((quota.used / quota.limit) * 100) : 0;
    parts.push(`quota ${pct}%${quota.resetsAt ? ` · resets ${quota.resetsAt}` : ''}`);
  } else if (cost) {
    parts.push(`$${cost.spentUsd.toFixed(2)} / $${cost.limitUsd.toFixed(2)}`);
  }

  if (interruptible) parts.push('esc to interrupt');

  const overBudget = cost ? cost.spentUsd > cost.limitUsd : false;
  const nearBudget = cost ? cost.spentUsd > cost.limitUsd * 0.8 : false;

  return (
    <Box marginTop={1}>
      <Text color={c(theme, 'accent')}>
        <Spinner />{' '}
      </Text>
      <Text color={overBudget ? c(theme, 'danger') : nearBudget ? c(theme, 'warning') : c(theme, 'muted')}>
        {parts.join(` ${theme.glyphs.bullet} `)}
      </Text>
    </Box>
  );
}
