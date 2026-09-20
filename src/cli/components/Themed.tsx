import React, { type PropsWithChildren } from 'react';
import { Box, Text, type BoxProps, type TextProps } from 'ink';
import { useTheme } from '../theme-context.js';
import { c, type Palette } from '../theme.js';

interface ThemedTextProps extends PropsWithChildren<TextProps> {
  variant?: keyof Palette;
}

export function ThemedText({ variant, children, ...props }: ThemedTextProps) {
  const theme = useTheme();
  const color = variant ? c(theme, variant) : props.color;
  return (
    <Text {...props} color={color}>
      {children}
    </Text>
  );
}

interface ThemedBoxProps extends PropsWithChildren<BoxProps> {
  variant?: keyof Palette;
}

export function ThemedBox({ variant, children, ...props }: ThemedBoxProps) {
  const theme = useTheme();
  const borderColor = variant ? c(theme, variant) : props.borderColor;
  return (
    <Box {...props} borderColor={borderColor}>
      {children}
    </Box>
  );
}
