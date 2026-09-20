import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { SessionController } from '../../../app/session-controller.js';
import { useTheme } from '../../theme-context.js';
import { c } from '../../theme.js';
import { maskKey } from '../../../app/redact.js';

export function ApiKeyEntry({
  controller,
  providerId,
  onSaved,
  onBack,
}: {
  controller: SessionController;
  providerId: string;
  onSaved: () => void;
  onBack: () => void;
}) {
  const theme = useTheme();
  const provider = controller.findProvider(providerId);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useInput((input, keyEvent) => {
    if (busy) return;

    if (keyEvent.escape) {
      onBack();
      return;
    }
    if (keyEvent.return) {
      setBusy(true);
      setError(null);
      void controller
        .setApiKey(providerId, key)
        .then((result) => {
          setBusy(false);
          if (result.ok) {
            setKey('');
            onSaved();
          } else {
            setError(result.error ?? 'Could not save the key.');
          }
        })
        .catch((err: Error) => {
          setBusy(false);
          setError(err.message);
        });
      return;
    }
    if (keyEvent.backspace || keyEvent.delete) {
      setKey((k) => k.slice(0, -1));
      return;
    }
    if (input && !keyEvent.ctrl && !keyEvent.meta) {
      setKey((k) => (k + input).replace(/\s+/g, ''));
    }
  });

  return (
    <Box flexDirection="column" marginY={1}>
      <Text bold color={c(theme, 'accent')}>
        {provider?.name ?? providerId} {theme.glyphs.bullet} API key
      </Text>
      <Box marginTop={1}>
        <Text color={c(theme, 'muted')}>
          Input is masked. The key is stored by OpenCode's credential store; LoopCode never writes it to config or logs.
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text>Key{'  '}</Text>
        <Text>{key ? maskKey(key) : ''}</Text>
        <Text inverse> </Text>
      </Box>
      {provider?.docsUrl ? (
        <Box marginTop={1}>
          <Text color={c(theme, 'muted')}>Get a key: {provider.docsUrl}</Text>
        </Box>
      ) : null}
      {error ? (
        <Box marginTop={1}>
          <Text color={c(theme, 'danger')}>
            {theme.glyphs.fail} {error}
          </Text>
        </Box>
      ) : null}
      <Box marginTop={1}>
        <Text color={c(theme, 'muted')}>{busy ? 'Verifying…' : 'enter save · esc back'}</Text>
      </Box>
    </Box>
  );
}
