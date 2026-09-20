import { describe, it, expect } from 'bun:test';
import { Text } from 'ink';
import { ThemedText, ThemedBox } from '../src/cli/components/Themed.js';
import { ThemeProvider } from '../src/cli/theme-context.js';
import { buildTheme } from '../src/cli/theme.js';
import { render } from 'ink-testing-library';
import React from 'react';

describe('Themed CLI Components', () => {
  const theme = buildTheme({ mode: 'dark', ascii: false });

  it('ThemedText renders variant text properly', () => {
    const { lastFrame } = render(
      <ThemeProvider theme={theme}>
        <ThemedText variant="accent">Hello Theme</ThemedText>
      </ThemeProvider>,
    );
    expect(lastFrame()).toContain('Hello Theme');
  });

  it('ThemedBox renders variant box properly', () => {
    const { lastFrame } = render(
      <ThemeProvider theme={theme}>
        <ThemedBox variant="danger" borderStyle="single">
          <Text>Error Box</Text>
        </ThemedBox>
      </ThemeProvider>,
    );
    expect(lastFrame()).toContain('Error Box');
  });
});
