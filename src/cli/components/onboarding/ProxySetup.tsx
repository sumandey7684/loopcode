import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { SessionController } from '../../../app/session-controller.js';
import { ANTIGRAVITY_RISK_TEXT } from '../../../proxy/consent.js';
import { useTheme } from '../../theme-context.js';
import { c } from '../../theme.js';

export function ProxySetup({
  controller,
  onReady,
  onBack,
}: {
  controller: SessionController;
  onReady: () => void;
  onBack: () => void;
}) {
  const theme = useTheme();
  const [accepted, setAccepted] = useState(false);
  const [selected, setSelected] = useState<'accept' | 'cancel'>('accept');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useInput((_input, key) => {
    if (busy) return;
    if (key.escape) onBack();

    if (!accepted) {
      if (key.upArrow || key.downArrow) {
        setSelected((s) => (s === 'accept' ? 'cancel' : 'accept'));
      }
      if (key.return) {
        if (selected === 'cancel') {
          onBack();
        } else {
          controller.acceptProxyRisk();
          setAccepted(true);
          setBusy(true);
          void controller.enableProxy().then((res) => {
            setBusy(false);
            if (res.ok) onReady();
            else setError(res.error ?? 'Proxy activation failed.');
          });
        }
      }
    }
  });

  return (
    <Box flexDirection="column" marginY={1}>
      <Text bold color={c(theme, 'warning')}>
        ⚠ Antigravity Proxy Risk Notice
      </Text>
      <Box marginTop={1} borderStyle="single" borderColor={c(theme, 'warning')} paddingX={1} flexDirection="column">
        {ANTIGRAVITY_RISK_TEXT.split('\n').map((line, i) => (
          <Text key={i} color={c(theme, 'muted')}>
            {line}
          </Text>
        ))}
      </Box>
      <Box flexDirection="column" marginTop={1} marginLeft={2}>
        <Text color={selected === 'accept' ? c(theme, 'accent') : undefined}>
          {selected === 'accept' ? `${theme.glyphs.prompt} ` : '  '}I understand the risk, enable it
        </Text>
        <Text color={selected === 'cancel' ? c(theme, 'accent') : undefined}>
          {selected === 'cancel' ? `${theme.glyphs.prompt} ` : '  '}Cancel
        </Text>
      </Box>
      {error ? (
        <Box marginTop={1}>
          <Text color={c(theme, 'danger')}>
            {theme.glyphs.fail} {error}
          </Text>
        </Box>
      ) : null}
      <Box marginTop={1}>
        <Text color={c(theme, 'muted')}>{busy ? 'Activating proxy…' : '↑↓ move · enter select · esc back'}</Text>
      </Box>
    </Box>
  );
}
