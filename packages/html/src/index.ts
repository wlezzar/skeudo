/*
 * Renders sketches of every view as HTML. Each view has its own folder, with its renderer (a hast
 * tree), its interaction (enhance) and its stylesheet. This file picks the view of each sketch, so
 * callers such as the Markdown plugins never name a view. skeudo.css holds every view's styles.
 */
import { parse, type Sketch } from '@skeudo/core';
import type { Element as HastElement } from 'hast';
import { enhanceCode } from './code/enhance';
import { codeToHast, type CodeHtmlOptions } from './code/render';
import { serialize } from './shared/hast';

export { escapeHtml } from './shared/hast';
export { tagHast, tagHtml } from './code/render';
export { repoHref, srcBaseHref, type GitHost, type SrcLink } from './code/links';

/** Options for rendering sketches. Each view reads the options it knows. */
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
  }
}

/** Renders a sketch (source text or an already parsed sketch) to an HTML string. */
export function toHtml(input: string | Sketch, opts: HtmlOptions = {}): string {
  return serialize(toHast(input, opts));
}

/**
 * Makes rendered sketches interactive. In code sketches:
 * - Hovering a binding, parameter or labeled name highlights all its uses within the same sketch;
 *   clicking pins the highlight.
 * - Hovering or focusing a call or a line with a `::doc` shows its explanation in a popover. On a
 *   block header, the block is highlighted with it.
 * Listeners sit on `root`, so sketches rendered under it later work too. Returns a function that
 * removes them.
 */
export function enhance(root: HTMLElement | Document = document): () => void {
  const off = [enhanceCode(root)];
  return () => off.forEach((remove) => remove());
}
