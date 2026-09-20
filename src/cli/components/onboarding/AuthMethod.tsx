import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { SessionController } from '../../../app/session-controller.js';
import { useTheme } from '../../theme-context.js';
import { c } from '../../theme.js';

export function AuthMethod({
  controller: _controller,
  onApiOrOAuth,
  onProxy,
  onSkip,
  onBack,
}: {
  controller: SessionController;
  onApiOrOAuth: () => void;
  onProxy: () => void;
  onSkip: () => void;
  onBack: () => void;
}) {
  const theme = useTheme();
  const [selected, setSelected] = useState<'api' | 'proxy' | 'skip'>('api');

  useInput((_input, key) => {
    if (key.escape) onBack();
    if (key.upArrow) setSelected((s) => (s === 'skip' ? 'proxy' : s === 'proxy' ? 'api' : 'api'));
    if (key.downArrow) setSelected((s) => (s === 'api' ? 'proxy' : s === 'proxy' ? 'skip' : 'skip'));
    if (key.return) {
      if (selected === 'api') onApiOrOAuth();
      else if (selected === 'proxy') onProxy();
      else onSkip();
    }
  });

  return (
    <Box flexDirection="column" marginY={1}>
      <Text bold color={c(theme, 'accent')}>
        Connect an LLM Provider
      </Text>
      <Box marginTop={1}>
        <Text color={c(theme, 'muted')}>Choose how LoopCode connects to language models.</Text>
      </Box>
      <Box flexDirection="column" marginTop={1} marginLeft={2}>
        <Text color={selected === 'api' ? c(theme, 'accent') : undefined}>
          {selected === 'api' ? `${theme.glyphs.prompt} ` : '  '}API Key / OAuth (Anthropic, OpenAI, Google, etc.)
        </Text>
        <Text color={selected === 'proxy' ? c(theme, 'accent') : undefined}>
          {selected === 'proxy' ? `${theme.glyphs.prompt} ` : '  '}Antigravity Local Proxy (Unofficial)
        </Text>
        <Text color={selected === 'skip' ? c(theme, 'accent') : undefined}>
          {selected === 'skip' ? `${theme.glyphs.prompt} ` : '  '}Skip for now (use existing environment variables)
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text color={c(theme, 'muted')}>↑↓ move · enter select · esc back</Text>
      </Box>
    </Box>
  );
}
