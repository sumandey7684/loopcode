import React from 'react';
import { Box, Text } from 'ink';

const markdownCache = new Map<string, React.ReactNode>();

function parseInlineStyles(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let currentText = text;
  let keyIdx = 0;

  while (currentText.length > 0) {
    const boldMatch = currentText.match(/(\*\*|__)(.*?)\1/);
    const codeMatch = currentText.match(/`(.*?)`/);

    const boldIdx = boldMatch?.index ?? -1;
    const codeIdx = codeMatch?.index ?? -1;

    if (boldIdx === -1 && codeIdx === -1) {
      parts.push(<Text key={keyIdx++}>{currentText}</Text>);
      break;
    }

    if (boldIdx !== -1 && (codeIdx === -1 || boldIdx < codeIdx)) {
      if (boldIdx > 0) {
        parts.push(<Text key={keyIdx++}>{currentText.slice(0, boldIdx)}</Text>);
      }
      parts.push(
        <Text key={keyIdx++} bold>
          {boldMatch![2]}
        </Text>,
      );
      currentText = currentText.slice(boldIdx + boldMatch![0].length);
    } else {
      if (codeIdx > 0) {
        parts.push(<Text key={keyIdx++}>{currentText.slice(0, codeIdx)}</Text>);
      }
      parts.push(
        <Text key={keyIdx++} color="yellow" backgroundColor="black">
          {codeMatch![1]}
        </Text>,
      );
      currentText = currentText.slice(codeIdx + codeMatch![0].length);
    }
  }

  return parts;
}

export function parseMarkdown(text: string): React.ReactNode {
  if (markdownCache.has(text)) {
    return markdownCache.get(text);
  }

  const lines = text.split('\n');
  const nodes = lines.map((line, idx) => {
    if (line.startsWith('### ')) {
      return (
        <Text key={idx} bold color="cyan">
          {line.slice(4)}
        </Text>
      );
    }
    if (line.startsWith('## ')) {
      return (
        <Text key={idx} bold color="magenta">
          {line.slice(3)}
        </Text>
      );
    }
    if (line.startsWith('# ')) {
      return (
        <Text key={idx} bold color="yellow">
          {line.slice(2)}
        </Text>
      );
    }
    if (line.startsWith('```')) {
      return null;
    }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      return (
        <Text key={idx} color="white">
          • {parseInlineStyles(line.slice(2))}
        </Text>
      );
    }
    return <Text key={idx}>{parseInlineStyles(line)}</Text>;
  });

  const element = <Box flexDirection="column">{nodes}</Box>;
  markdownCache.set(text, element);
  return element;
}

export function Markdown({ text }: { text: string }) {
  return <>{parseMarkdown(text)}</>;
}
