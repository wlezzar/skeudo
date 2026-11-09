/** Pieces every view's TextMate rules use. */

export type Rule = Record<string, unknown>;

/**
 * The start of a line, after any indentation. `\G` also matches where an enclosing rule left off: after the
 * indentation of a list item that holds a fence, and where a sketch's first line starts.
 */
export const LINE_START = String.raw`(?:^|\G)\s*`;
/** Never matches, for rules that last until the end of the sketch. */
export const NEVER = String.raw`(?!)`;
