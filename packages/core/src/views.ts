/*
 * Skeudo has several views, like Mermaid's diagram types: each is a kind of block with its own grammar,
 * parser and renderer. They share one fence and one file extension, and a block names its view on its
 * first line, as `view: data` (header.ts). Tools that host blocks, such as the Markdown plugins and the
 * CLI, go through this registry and never name a view, so adding a view means adding its folder and an
 * entry here.
 */
import { parseCode } from './code/parse.ts';
import type { CodeSketch, ParseOptions } from './code/types.ts';
import { parseData } from './data/parse.ts';
import type { DataSketch } from './data/types.ts';
import type { Diagnostic } from './diagnostic.ts';
import { firstLine, readHeader, splitLines } from './header.ts';

/** A parsed block of any view, told apart by `view`. */
export type Sketch = CodeSketch | DataSketch;

/** The name of a view, such as `code`. A block names its view on its first line, as `view: code`. */
export type ViewName = Sketch['view'];

/** One kind of Skeudo block. */
export interface View<S extends Sketch = Sketch> {
  name: S['view'];
  /** Parses a whole block, header included. Line numbers count from the block's first line. */
  parse(source: string, options?: ParseOptions): S;
}

/** Pseudocode for code review, with every outside effect tagged. See spec/code.md. */
export const codeView: View<CodeSketch> = { name: 'code', parse: parseCode };

/** Tables, example rows, and a story of how the rows change. See spec/data.md. */
export const dataView: View<DataSketch> = { name: 'data', parse: parseData };

/** Every view. The first is the fallback, for a block that doesn't name one. */
export const VIEWS: readonly View[] = [codeView, dataView];

/** The view a block is written in: the one its header names, or code when it has none or names no view. */
export function viewOf(source: string): View {
  const name = readHeader(splitLines(source))?.name;
  return VIEWS.find((v) => v.name === name) ?? VIEWS[0];
}

/**
 * Parses a block in its view. A block without a header, or whose first line names no view, is parsed as
 * code with a warning, since a sketch always renders. A view's own parser, such as parseCode, doesn't warn.
 */
export function parse(source: string, options: ParseOptions = {}): Sketch {
  const lines = splitLines(source);
  const header = readHeader(lines);
  const view = VIEWS.find((v) => v.name === header?.name);
  const sketch = (view ?? VIEWS[0]).parse(source, options);
  if (!view) {
    const warning = headerWarning(lines, header);
    // Put first and sorted, so it leads the other warnings on its line.
    if (warning) sketch.diagnostics = [warning, ...sketch.diagnostics].sort((a, b) => a.line - b.line);
  }
  return sketch;
}

/** The warning for a block whose header is missing or names no view, on its first line. A blank block gets none. */
function headerWarning(lines: readonly string[], header: ReturnType<typeof readHeader>): Diagnostic | undefined {
  const warning = (index: number, message: string): Diagnostic => ({ line: index + 1, severity: 'warning', message });
  if (header) return warning(header.index, `No view named ${header.name}. The views are ${list(VIEWS.map((v) => v.name))}.`);
  const first = firstLine(lines);
  return first && warning(first.index, 'A sketch should start with its view, as in view: code.');
}

/** `a`, `a and b`, `a, b and c`. */
const list = (words: string[]) => (words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`);

/** Fence languages that hold a Skeudo block: skeudo, and sketch, the format's working name, which older documents use. */
export const FENCE_LANGS: readonly string[] = ['skeudo', 'sketch'];
