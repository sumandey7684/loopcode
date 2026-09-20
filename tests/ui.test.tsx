import { describe, it, expect } from 'bun:test';
import React from 'react';
import { render } from 'ink-testing-library';
import { ThemeProvider } from '../src/cli/theme-context.js';
import { buildTheme } from '../src/cli/theme.js';
import { LiveStatus } from '../src/cli/components/LiveStatus.js';
import { CommandPalette } from '../src/cli/components/CommandPalette.js';
import { HintBar } from '../src/cli/components/HintBar.js';
import { Transcript } from '../src/cli/components/Transcript.js';
import { resolve } from '../src/cli/keys.js';
import type { AppEvent } from '../src/app/events.js';

describe('TUI Redesign UI Components', () => {
  const theme = buildTheme({ mode: 'dark', ascii: false });

  it('LiveStatus renders active phase and cost telemetry', () => {
    const { lastFrame } = render(
      <ThemeProvider theme={theme}>
        <LiveStatus
          active={true}
          phase="executing"
          detail="batch 1/3"
          cost={{ spentUsd: 1.5, limitUsd: 10.0 }}
          quota={null}
          interruptible={true}
        />
      </ThemeProvider>,
    );

    const frame = lastFrame();
    expect(frame).toContain('executing');
    expect(frame).toContain('batch 1/3');
    expect(frame).toContain('$1.50 / $10.00');
    expect(frame).toContain('esc to interrupt');
  });

  it('CommandPalette filters matching slash commands', () => {
    const { lastFrame } = render(
      <ThemeProvider theme={theme}>
        <CommandPalette query="/log" selectedIndex={0} />
      </ThemeProvider>,
    );

    const frame = lastFrame();
    expect(frame).toContain('/login');
    expect(frame).toContain('/logout');
  });

  it('HintBar renders hints string', () => {
    const { lastFrame } = render(
      <ThemeProvider theme={theme}>
        <HintBar text="↑↓ move · enter select · esc close" />
      </ThemeProvider>,
    );

    expect(lastFrame()).toContain('↑↓ move · enter select · esc close');
  });

  it('Transcript renders committed events via Static and live events outside', () => {
    const committed: AppEvent[] = [{ id: '1', kind: 'user-prompt', text: 'Build feature X', at: Date.now() }];
    const live: AppEvent[] = [
      {
        id: '2',
        kind: 'tool',
        tool: 'bash',
        summary: 'bun test',
        status: 'running',
        at: Date.now(),
      },
    ];

    const { lastFrame } = render(
      <ThemeProvider theme={theme}>
        <Transcript committed={committed} live={live} expandedIds={new Set()} />
      </ThemeProvider>,
    );

    const frame = lastFrame();
    expect(frame).toContain('Build feature X');
    expect(frame).toContain('bash');
    expect(frame).toContain('bun test');
  });

  it('keys.ts resolve maps keypresses correctly', () => {
    const res = resolve('c', { ctrl: true } as any, { context: 'input', inputEmpty: false, hasOverlay: false });
    expect(res.action).toBe('interrupt');

    const escRes = resolve('', { escape: true } as any, { context: 'overlay', inputEmpty: false, hasOverlay: true });
    expect(escRes.action).toBe('close');
  });
});
