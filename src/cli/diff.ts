export function renderDiff(diff: string): string {
  return diff
    .split('\n')
    .map((line) => {
      if (line.startsWith('+') && !line.startsWith('+++')) return `\x1b[32m${line}\x1b[0m`; // Green
      if (line.startsWith('-') && !line.startsWith('---')) return `\x1b[31m${line}\x1b[0m`; // Red
      if (line.startsWith('@@')) return `\x1b[36m${line}\x1b[0m`; // Cyan
      return line;
    })
    .join('\n');
}
