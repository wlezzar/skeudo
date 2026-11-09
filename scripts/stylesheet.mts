/// <reference types="node" />
// Build helper for the apps that inline Skeudo's styles into a page or ship them as one file.
import { readFileSync } from 'node:fs';

const IMPORT = /^@import url\('([^']+)'\);[ \t]*\n?/gm;

/**
 * Reads a stylesheet with each `@import url('…');` line replaced by the file it names, relative to the
 * stylesheet, so it can be inlined. The files are copied as they are, unlike a CSS bundler's output.
 */
export function readStylesheet(url: URL): string {
  return readFileSync(url, 'utf8').replace(IMPORT, (_, path: string) => readStylesheet(new URL(path, url)));
}
