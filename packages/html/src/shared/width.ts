/*
 * Width estimates. A renderer can't measure the page, but sketches are set in a monospace font, so
 * widths can be estimated in `ch`: one per character, two for a wide one.
 */

const WIDE_RE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{1f300}-\u{1faff}\u{20000}-\u{3fffd}]/u;

/** Estimated width of a text, in `ch` of a monospace font. */
export function textWidth(s: string): number {
  let w = 0;
  for (const c of s) w += WIDE_RE.test(c) ? 2 : 1;
  return w;
}
