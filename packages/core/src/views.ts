/*
 * Skeudo has several views, like Mermaid's diagram types: each is a kind of block with its own grammar,
 * parser and renderer. They share one fence and one file extension. Tools that host blocks, such as the
 * Markdown plugins and the CLI, go through this registry and never name a view, so adding a view means
 * adding its folder and an entry here.
 */
import { parseCode } from './code/parse';
import type { CodeSketch, ParseOptions } from './code/types';

/** A parsed block of any view, told apart by `view`. */
export type Sketch = CodeSketch;

/** The name of a view, such as `code`. */
export type ViewName = Sketch['view'];

/** One kind of Skeudo block. */
export interface View<S extends Sketch = Sketch> {
  name: S['view'];
  /** Parses a whole block. Line numbers count from the block's first line. */
  parse(source: string, options?: ParseOptions): S;
}

/** Pseudocode for code review, with every outside effect tagged. See spec/code.md. */
export const codeView: View<CodeSketch> = { name: 'code', parse: parseCode };

/** Every view. The first is the default, for a block that doesn't name one. */
export const VIEWS: readonly View[] = [codeView];

/** The view a block is written in. Every block is code until another view is registered. */
export function viewOf(_source: string): View {
  return VIEWS[0];
}

/** Parses a block in its view. */
export function parse(source: string, options: ParseOptions = {}): Sketch {
  return viewOf(source).parse(source, options);
}

/** Fence languages that hold a Skeudo block: skeudo, and sketch, the format's working name, which older documents use. */
export const FENCE_LANGS: readonly string[] = ['skeudo', 'sketch'];
