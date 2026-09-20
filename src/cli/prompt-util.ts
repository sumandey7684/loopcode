export function squashPrompt(prompt: string): string {
  const lines = prompt.split('\n');
  if (lines.length > 5) {
    const firstLine = lines[0];
    const lastLine = lines[lines.length - 1];
    const middleCount = lines.length - 2;
    return `${firstLine}\n+ ${middleCount} lines...\n${lastLine}`;
  }
  return prompt;
}
