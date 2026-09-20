import React from 'react';
import { Box, Text } from 'ink';

export interface StructuredDiffProps {
  diff: string;
}

export function StructuredDiff({ diff }: StructuredDiffProps) {
  const lines = diff.split('\n');
  let oldLineNum = 0;
  let newLineNum = 0;

  const parsedLines = lines.map((line, idx) => {
    if (line.startsWith('+++') || line.startsWith('---')) {
      return (
        <Box key={idx} paddingX={1}>
          <Text bold color="yellow">
            {line}
          </Text>
        </Box>
      );
    }

    const hunkMatch = line.match(/^@@ -(\d+),?\d* \+(\d+),?\d* @@/);
    if (hunkMatch) {
      oldLineNum = parseInt(hunkMatch[1], 10);
      newLineNum = parseInt(hunkMatch[2], 10);
      return (
        <Box key={idx} paddingX={1}>
          <Text color="cyan">{line}</Text>
        </Box>
      );
    }

    if (line.startsWith('+')) {
      const currentNew = newLineNum > 0 ? newLineNum++ : '';
      return (
        <Box key={idx} flexDirection="row" paddingX={1}>
          <Box width={6}>
            <Text color="gray"> </Text>
          </Box>
          <Box width={6}>
            <Text color="green">{currentNew ? `${currentNew} ` : ' '}</Text>
          </Box>
          <Text color="green">{line}</Text>
        </Box>
      );
    }

    if (line.startsWith('-')) {
      const currentOld = oldLineNum > 0 ? oldLineNum++ : '';
      return (
        <Box key={idx} flexDirection="row" paddingX={1}>
          <Box width={6}>
            <Text color="red">{currentOld ? `${currentOld} ` : ' '}</Text>
          </Box>
          <Box width={6}>
            <Text color="gray"> </Text>
          </Box>
          <Text color="red">{line}</Text>
        </Box>
      );
    }

    const currentOld = oldLineNum > 0 ? oldLineNum++ : '';
    const currentNew = newLineNum > 0 ? newLineNum++ : '';
    return (
      <Box key={idx} flexDirection="row" paddingX={1}>
        <Box width={6}>
          <Text color="gray">{currentOld ? `${currentOld} ` : ' '}</Text>
        </Box>
        <Box width={6}>
          <Text color="gray">{currentNew ? `${currentNew} ` : ' '}</Text>
        </Box>
        <Text color="white">{line}</Text>
      </Box>
    );
  });

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="gray">
      {parsedLines}
    </Box>
  );
}
