/*
 * Renders sketches of every view as HTML. Each view has its own folder, with its renderer (a hast
 * tree), its interaction (enhance) and its stylesheet. This file picks the view of each sketch, so
 * callers such as the Markdown plugins never name a view. skeudo.css holds every view's styles.
 */
import { parse, type Sketch } from '@skeudo/core';
import type { Element as HastElement } from 'hast';
import { enhanceCode } from './code/enhance';
import { codeToHast, type CodeHtmlOptions } from './code/render';
import { enhanceData } from './data/enhance';
import { dataToHast } from './data/render';
import { serialize } from './shared/hast';

export { escapeHtml } from './shared/hast';
export { tagHast, tagHtml } from './code/render';
export { repoHref, srcBaseHref, type GitHost, type SrcLink } from './code/links';

/** Options for rendering sketches. Each view reads the options it knows; the data view has none. */
export interface HtmlOptions extends CodeHtmlOptions {}

/**
 * Builds a sketch (source text or an already parsed sketch) as a hast tree: one element, the same
 * markup toHtml returns.
 */
export function toHast(input: string | Sketch, opts: HtmlOptions = {}): HastElement {
  const sketch = typeof input === 'string' ? parse(input, opts) : input;
  switch (sketch.view) {
    case 'code':
      return codeToHast(sketch, opts);
    case 'data':
      return dataToHast(sketch);
  }
}

/** Renders a sketch (source text or an already parsed sketch) to an HTML string. */
export function toHtml(input: string | Sketch, opts: HtmlOptions = {}): string {
  return serialize(toHast(input, opts));
}

/**
 * Makes rendered sketches interactive.
 *
 * In code sketches:
 * - Hovering a binding, parameter or labeled name highlights all its uses within the same sketch;
 *   clicking pins the highlight.
 * - Hovering or focusing a call or a line with a `::doc` shows its explanation in a popover. On a
 *   block header, the block is highlighted with it.
 *
 * In data sketches:
 * - The story starts at its first step. Clicking a step shows its rows, and the arrow keys step through
 *   the story while the sketch has focus.
 * - Hovering a reference highlights the row it points at, and hovering a row the references to it.
 * - Resting on a step or a table's name shows its explanation; clicking its mark keeps it open.
 *
 * Listeners sit on `root`, so sketches rendered under it later work too. Returns a function that
 * removes them.
 */
export function enhance(root: HTMLElement | Document = document): () => void {
  const off = [enhanceCode(root), enhanceData(root)];
  return () => off.forEach((remove) => remove());
}
