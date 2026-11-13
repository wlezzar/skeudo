/*
 * A block names its view on its first non-blank line, as `view: data`. The header stays a line of the
 * block, so line numbers match its text. Picking the view, and warning when the header is missing or names
 * no view, happens in views.ts. Each view's parser skips its own header line, and nothing else.
 */

/** Splits a block into lines, whatever its line endings. */
export const splitLines = (source: string): string[] => source.replace(/\r\n?/g, '\n').split('\n');

/** A block's first non-blank line, trimmed, and its index. */
export function firstLine(lines: readonly string[]): { text: string; index: number } | undefined {
  const index = lines.findIndex((l) => l.trim() !== '');
  return index === -1 ? undefined : { text: lines[index].trim(), index };
}

const HEADER = /^view:\s*(\S+)$/;

/**
 * `view:` and a name, alone on a block's first non-blank line. It is a header when the name is a view's.
 * views.ts warns when it isn't. Undefined when the first line isn't of this form.
 */
export function readHeader(lines: readonly string[]): { name: string; index: number } | undefined {
  const first = firstLine(lines);
  const name = first && HEADER.exec(first.text)?.[1];
  return name ? { name, index: first.index } : undefined;
}
