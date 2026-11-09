/*
 * Skeudo has several views, like Mermaid's diagram types: each is a kind of block with its own grammar,
 * parser and renderer. They share one fence and one file extension, and a block names its view on its
 * first line (header.ts). Tools that host blocks, such as the Markdown plugins and the CLI, go through
 * this registry and never name a view, so adding a view means adding its folder and an entry here.
 */
import { parseCode } from './code/parse';
import type { CodeSketch, ParseOptions } from './code/types';
import { parseData } from './data/parse';
import type { DataSketch } from './data/types';
import { firstLine, splitLines } from './header';

/** A parsed block of any view, told apart by `view`. */
export type Sketch = CodeSketch | DataSketch;

/** The name of a view, such as `code`. A block names its view by starting with it, alone on a line. */
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

/** Every view. The first is the default, for a block that doesn't name one. */
export const VIEWS: readonly View[] = [codeView, dataView];

/** The view a block is written in: the one its first non-blank line names, alone, or else code. */
export function viewOf(source: string): View {
  const first = firstLine(splitLines(source))?.text;
  return VIEWS.find((v) => v.name === first) ?? VIEWS[0];
}

/** Parses a block in its view. */
export function parse(source: string, options: ParseOptions = {}): Sketch {
  return viewOf(source).parse(source, options);
}

/** Fence languages that hold a Skeudo block: skeudo, and sketch, the format's working name, which older documents use. */
export const FENCE_LANGS: readonly string[] = ['skeudo', 'sketch'];
