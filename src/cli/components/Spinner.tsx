import React, { useEffect, useState } from 'react';
import { Text } from 'ink';
import { useTheme } from '../theme-context.js';
import { isTestEnv } from '../../platform/env.js';

/** Frame-based spinner. Stops animating under tests to keep output stable. */
export function Spinner({ intervalMs = 90 }: { intervalMs?: number }) {
  const theme = useTheme();
  const [frame, setFrame] = useState(0);
  const frames = theme.glyphs.spinner;

  useEffect(() => {
    if (isTestEnv()) return;
    const timer = setInterval(() => setFrame((f) => (f + 1) % frames.length), intervalMs);
    return () => clearInterval(timer);
  }, [frames.length, intervalMs]);

  return <Text>{frames[frame]}</Text>;
}
