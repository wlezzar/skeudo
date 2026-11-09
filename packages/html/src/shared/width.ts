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

/*
 * Widths of the printable ASCII characters in a common sans-serif font (Helvetica's, in thousandths of
 * an em), from space to `~`. Other fonts differ a little, so proportionalWidth() adds a margin.
 */
// prettier-ignore
const SANS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, // space to /
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, // 0 to ?
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, // @ to O
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, // P to _
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, // ` to o
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584, // p to ~
];
/** The width of `0` in the same units: what `ch` measures. */
const ZERO = 556;
const MARGIN = 1.12;

/** Estimated width of a text in a sans-serif font, in `ch` of that font, with a margin for wider fonts. */
export function proportionalWidth(s: string): number {
  let w = 0;
  for (const c of s) {
    const code = c.codePointAt(0)!;
    w += code >= 32 && code < 127 ? SANS[code - 32] / ZERO : WIDE_RE.test(c) ? 2 : 1;
  }
  return w * MARGIN;
}
