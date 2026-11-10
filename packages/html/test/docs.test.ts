import { describe, expect, test } from 'vitest';
import { toHtml } from '../src/index.ts';

const SKETCH = [
  'settle(invoice):',
  '    if invoice is past due:              ::doc[past the due date plus the grace period]',
  '        add_fee(invoice)                 ::write:postgres.invoices',
  '    left = apply_credits(invoice)        ::write:postgres.credits ::doc[first line] ::doc[second line]',
  '    charge(left)                         ::write:stripe',
  '    ::doc:apply_credits[spends the oldest credits first]',
  '    ::doc:add_fee[2% of the amount due]',
  '    ::src:add_fee[billing/fees.py:10]',
  '    ::repo[git+https://github.com/org/shop@a1b2c3d]',
].join('\n');

/** The opening tag of the first element with this class, inside the given line's row, if any. */
function openTag(html: string, line: number, cls: string): string | undefined {
  const row = new RegExp(`<div [^>]*data-line="${line}"[^>]*>([\\s\\S]*?)(?=<div [^>]*data-line=|$)`).exec(html)?.[1];
  if (row === undefined) throw new Error(`no line ${line}`);
  return new RegExp(`<(?:span|a) class="[^"]*\\b${cls}\\b[^"]*"[^>]*>`).exec(row)?.[0];
}

describe('explanations in a rendered sketch', () => {
  const html = toHtml(SKETCH);

  test('are hidden: no ::doc text or pill is shown, and lines made only of ::doc tags are dropped', () => {
    expect(html).not.toContain('::doc');
    expect(html).not.toContain('sk-k-doc');
    for (const line of [6, 7, 8, 9]) expect(html).not.toContain(`data-line="${line}"`);
  });

  test('a call with a ::doc carries it for the popover and as its tooltip, and takes focus', () => {
    const call = openTag(html, 4, 'sk-call');
    expect(call).toContain('class="sk-call sk-has-doc"');
    expect(call).toContain('data-doc="spends the oldest credits first"');
    expect(call).toContain('title="spends the oldest credits first"');
    expect(call).toContain('tabindex="0"');
    expect(openTag(html, 5, 'sk-call')).toBe('<span class="sk-call">');
  });

  test('a linked call puts its explanation before where it is defined, and is focusable as a link', () => {
    const call = openTag(html, 3, 'sk-call')!;
    expect(call).toMatch(/^<a /);
    expect(call).toContain('title="2% of the amount due\n\nDefined at billing/fees.py:10"');
    expect(call).toContain('data-doc="2% of the amount due"');
    expect(call).not.toContain('tabindex');
  });

  test("a line with a ::doc carries it on its code, with a marker, one explanation per line of text", () => {
    const code = openTag(html, 2, 'sk-code');
    expect(code).toContain('data-doc="past the due date plus the grace period"');
    expect(code).toContain('tabindex="0"');
    expect(openTag(html, 2, 'sk-doc-mark')).toBe('<span class="sk-doc-mark" aria-hidden="true">');
    expect(openTag(html, 4, 'sk-code')).toContain('data-doc="first line\nsecond line"');
    expect(openTag(html, 3, 'sk-code')).toBe('<span class="sk-code">');
    expect(openTag(html, 3, 'sk-doc-mark')).toBeUndefined();
  });

  test('a line keeps its other tags in the tag column', () => {
    expect(html).toContain('sk-k-write');
    expect((html.match(/class="sk-tagw"/g) ?? []).length).toBe(3);
  });
});
