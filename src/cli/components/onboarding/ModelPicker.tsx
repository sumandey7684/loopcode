import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { SessionController } from '../../../app/session-controller.js';
import { useTheme } from '../../theme-context.js';
import { c } from '../../theme.js';

export function ModelPicker({
  controller,
  onDone,
  onBack,
}: {
  controller: SessionController;
  onDone: () => void;
  onBack: () => void;
}) {
  const theme = useTheme();
  const catalog = controller.catalog();
  const connectedProviders = catalog?.providers.filter((p) => p.connected || p.envSatisfied) ?? [];

  const allModels = connectedProviders.flatMap((p) =>
    p.models.map((m) => ({ providerId: p.id, modelId: m.id, name: m.name })),
  );

  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput((_input, key) => {
    if (key.escape) onBack();
    if (allModels.length === 0) {
      if (key.return) onDone();
      return;
    }
    if (key.upArrow) setSelectedIndex((idx) => Math.max(0, idx - 1));
    if (key.downArrow) setSelectedIndex((idx) => Math.min(allModels.length - 1, idx + 1));
    if (key.return) {
      const chosen = allModels[selectedIndex];
      if (chosen) {
        controller.setModelForRole('default', chosen.providerId, chosen.modelId);
      }
      onDone();
    }
  });

  return (
    <Box flexDirection="column" marginY={1}>
      <Text bold color={c(theme, 'accent')}>
        Select Default Model
      </Text>
      {allModels.length === 0 ? (
        <Box marginTop={1} flexDirection="column">
          <Text color={c(theme, 'warning')}>No connected models found in catalog.</Text>
          <Text color={c(theme, 'muted')}>Press Enter to proceed with default routing.</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={1} marginLeft={2}>
          {allModels.map((m, i) => {
            const selected = i === selectedIndex;
            return (
              <Box key={`${m.providerId}/${m.modelId}`}>
                <Text color={selected ? c(theme, 'accent') : undefined}>
                  {selected ? `${theme.glyphs.prompt} ` : '  '}
                  {m.providerId}/{m.modelId} ({m.name})
                </Text>
              </Box>
            );
          })}
        </Box>
      )}
      <Box marginTop={1}>
        <Text color={c(theme, 'muted')}>↑↓ move · enter select · esc back</Text>
      </Box>
    </Box>
  );
}
