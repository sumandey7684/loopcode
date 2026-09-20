import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { SessionController } from '../../../app/session-controller.js';
import type { Catalog, ProviderInfo } from '../../../auth/provider-catalog.js';
import { useTheme } from '../../theme-context.js';
import { c } from '../../theme.js';
import { Spinner } from '../Spinner.js';

export function ProviderPicker({
  controller,
  onApiKey,
  onOAuth,
  onBack,
}: {
  controller: SessionController;
  onApiKey: (providerId: string) => void;
  onOAuth: (providerId: string, methodIndex: number) => void;
  onBack: () => void;
}) {
  const theme = useTheme();
  const [catalog, setCatalog] = useState<Catalog | null>(controller.catalog());
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (!catalog) {
      void controller.refreshCatalog().then(setCatalog);
    }
  }, [catalog, controller]);

  const providers: ProviderInfo[] = catalog?.providers ?? [];

  useInput((_input, key) => {
    if (key.escape) onBack();
    if (providers.length === 0) return;
    if (key.upArrow) setSelectedIndex((idx) => Math.max(0, idx - 1));
    if (key.downArrow) setSelectedIndex((idx) => Math.min(providers.length - 1, idx + 1));
    if (key.return) {
      const p = providers[selectedIndex];
      if (!p) return;
      const oauthMethod = p.authMethods.find((m) => m.type === 'oauth');
      if (oauthMethod) {
        onOAuth(p.id, oauthMethod.index);
      } else {
        onApiKey(p.id);
      }
    }
  });

  if (!catalog) {
    return (
      <Box marginY={1}>
        <Text color={c(theme, 'muted')}>
          <Spinner /> Discovering available providers…
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginY={1}>
      <Text bold color={c(theme, 'accent')}>
        Select Provider
      </Text>
      <Box flexDirection="column" marginTop={1} marginLeft={2}>
        {providers.map((p, i) => {
          const selected = i === selectedIndex;
          return (
            <Box key={p.id}>
              <Text color={selected ? c(theme, 'accent') : undefined}>
                {selected ? `${theme.glyphs.prompt} ` : '  '}
                {p.name}
              </Text>
              {p.connected ? <Text color={c(theme, 'success')}> (Connected)</Text> : null}
              {p.envSatisfied && !p.connected ? <Text color={c(theme, 'warning')}> (Env set)</Text> : null}
            </Box>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text color={c(theme, 'muted')}>↑↓ move · enter select · esc back</Text>
      </Box>
    </Box>
  );
}
