import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';

interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'warning';
  duration?: number;
}

export function Toast({ message, type, duration = 3000 }: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), duration);
    return () => clearTimeout(timer);
  }, [duration]);

  if (!visible) return null;

  const color = type === 'success' ? 'green' : type === 'error' ? 'red' : 'yellow';
  const icon = type === 'success' ? '✓' : type === 'error' ? '✗' : '⚠';

  return (
    <Box borderStyle="round" borderColor={color} paddingX={1} marginY={1}>
      <Text color={color}>
        {icon} {message}
      </Text>
    </Box>
  );
}
