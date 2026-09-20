import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { SessionController } from '../../../app/session-controller.js';
import type { OAuthSession } from '../../../auth/auth-service.js';
import { useTheme } from '../../theme-context.js';
import { c } from '../../theme.js';
import { Spinner } from '../Spinner.js';

export function OAuthFlow({
  controller,
  providerId,
  methodIndex,
  onSuccess,
  onBack,
}: {
  controller: SessionController;
  providerId: string;
  methodIndex: number;
  onSuccess: () => void;
  onBack: () => void;
}) {
  const theme = useTheme();
  const [session, setSession] = useState<OAuthSession | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [manual, setManual] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [controllerAbort] = useState(() => new AbortController());

  useEffect(() => {
    let cancelled = false;

    void controller
      .startOAuth(providerId, methodIndex)
      .then(async (started) => {
        if (cancelled) return;
        setSession(started);
        if (started.mode === 'code') {
          setManual(true);
          return;
        }
        const result = await controller.awaitOAuth(started, {
          onTick: (ms) => setElapsed(Math.floor(ms / 1000)),
          signal: controllerAbort.signal,
        });
        if (cancelled) return;
        if (result.ok) onSuccess();
        else setError(result.error ?? 'Authorization failed.');
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
      controllerAbort.abort();
      session?.cancel();
    };
  }, [providerId, methodIndex]);

  useInput((input, key) => {
    if (key.escape) {
      controllerAbort.abort();
      session?.cancel();
      onBack();
      return;
    }

    if (manual) {
      if (key.return) {
        if (!session) return;
        void controller.completeOAuth(session, code).then((result) => {
          if (result.ok) onSuccess();
          else setError(result.error ?? 'The code was rejected.');
        });
        return;
      }
      if (key.backspace || key.delete) {
        setCode((v) => v.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) setCode((v) => (v + input).trim());
      return;
    }

    if (input === 'm') {
      setManual(true);
      return;
    }
  });

  return (
    <Box flexDirection="column" marginY={1}>
      <Text bold color={c(theme, 'accent')}>
        {providerId} {theme.glyphs.bullet} OAuth
      </Text>

      {!session ? (
        <Box marginTop={1}>
          <Text color={c(theme, 'muted')}>
            <Spinner /> Requesting an authorization URL…
          </Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1}>
          <Text color={c(theme, 'muted')}>
            {session.browserOpened ? '1. Opened your browser.' : '1. Open this URL in your browser:'}
          </Text>
          <Box marginTop={session.browserOpened ? 0 : 1}>
            <Text color={c(theme, 'accentDim')}>{session.url}</Text>
          </Box>

          {manual ? (
            <Box flexDirection="column" marginTop={1}>
              <Text color={c(theme, 'muted')}>2. Paste the authorization code:</Text>
              <Box>
                <Text>Code{'  '}</Text>
                <Text>{code}</Text>
                <Text inverse> </Text>
              </Box>
            </Box>
          ) : (
            <Box marginTop={1}>
              <Text color={c(theme, 'muted')}>
                <Spinner /> 2. Waiting for the browser to come back… {elapsed}s
              </Text>
            </Box>
          )}

          {session.instructions ? (
            <Box marginTop={1}>
              <Text color={c(theme, 'muted')}>{session.instructions}</Text>
            </Box>
          ) : null}
        </Box>
      )}

      {error ? (
        <Box marginTop={1}>
          <Text color={c(theme, 'danger')}>
            {theme.glyphs.fail} {error}
          </Text>
        </Box>
      ) : null}

      <Box marginTop={1}>
        <Text color={c(theme, 'muted')}>
          {manual ? 'enter submit · esc back' : 'esc cancel · m enter code manually'}
        </Text>
      </Box>
    </Box>
  );
}
