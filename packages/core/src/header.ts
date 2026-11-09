/*
 * A block may name its view on its first non-blank line, alone, as Mermaid does: `data`. A block that
 * doesn't is in the code view. The header stays a line of the block, so line numbers match its text.
 */

/** Splits a block into lines, whatever its line endings. */
export const splitLines = (source: string): string[] => source.replace(/\r\n?/g, '\n').split('\n');

/** A block's first non-blank line, trimmed, and its index. When it is a view's name, it is the block's header. */
export function firstLine(lines: readonly string[]): { text: string; index: number } | undefined {
  const index = lines.findIndex((l) => l.trim() !== '');
  return index === -1 ? undefined : { text: lines[index].trim(), index };
}
