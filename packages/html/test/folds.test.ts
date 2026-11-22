import { describe, expect, test } from 'vitest';
import { toHtml } from '../src/index.ts';

const SKETCH = [
  'view: code',
  'checkout(cart, card):',
  '    reserve stock:                       ::fold',
  '        for each item:',
  '            decrement stock              ::write:postgres.stock[!no lock]',
  '            if stock is short:',
  '                ::fail:OutOfStock',
  '        log the reservation              ::write:postgres.stock',
  '    body = request.json()                ::untrusted:body',
  '    if body is odd:',
  '        warn them                        ::write:sendgrid',
  '    charge the card:                     ::fold',
  '        intent = create_intent(card, body)  ::write:stripe ::secret:intent ::new',
  '        confirm if the bank asks:        ::fold',
  '            wait for the customer        ::read:stripe-webhooks',
  '',
  '        email the receipt                ::write:sendgrid ::removed',
  '    ::src:create_intent[pay/stripe.py:10]',
].join('\n');

/** The markup of a line's row. */
function row(html: string, line: number): string {
  const found = new RegExp(`<div [^>]*data-line="${line}"[^>]*>[\\s\\S]*?(?=<div [^>]*data-line=|</div></div>$)`).exec(html)?.[0];
  if (found === undefined) throw new Error(`no line ${line}`);
  return found;
}

/** The classes of a line's row. */
const rowClasses = (html: string, line: number) => /^<div class="([^"]*)"/.exec(row(html, line))![1].split(' ');

/** The pills of a folded line's summary, as `kind:value`, with `×n`, `[!note]` and `← variable` when they show. */
function summary(html: string, line: number): string[] {
  const rollup = /<span class="sk-rollup"[\s\S]*$/.exec(row(html, line))?.[0] ?? '';
  return rollup.split('<span class="sk-tagw').slice(1).map((pill) => {
    const kind = /sk-kind">([^<]*)/.exec(pill)![1];
    const mods = /sk-mod">([^<]*)/.exec(pill)?.[1] ?? '';
    const value = /sk-val"[^>]*>([^<]*)/.exec(pill)?.[1];
    const count = /sk-count">([^<]*)/.exec(pill)?.[1];
    const strip = (part?: string) => part?.replace(/^[^>]*>/, '').replace(/<[^>]*>/g, '');
    const [, note, flow] = /(?:class="sk-note([\s\S]*?))?(?:class="sk-flow([\s\S]*))?$/.exec(pill)!;
    return [`${kind}${mods}${value ? `:${value}` : ''}`, count, strip(note), strip(flow)].filter(Boolean).join(' ');
  });
}

describe('folds in a rendered sketch', () => {
  const html = toHtml(SKETCH);

  test('hide the ::fold tag', () => {
    expect(html).not.toContain('sk-k-fold');
  });

  test('give every block header but the signature a chevron, open unless tagged ::fold', () => {
    expect(row(html, 2)).not.toContain('sk-fold');
    expect(rowClasses(html, 3)).toEqual(expect.arrayContaining(['sk-foldable', 'sk-folded']));
    expect(row(html, 3)).toContain('<button type="button" class="sk-fold" aria-expanded="false" aria-label="Unfold block"></button>');
    expect(rowClasses(html, 10)).toContain('sk-foldable');
    expect(rowClasses(html, 10)).not.toContain('sk-folded');
    expect(row(html, 10)).toContain('aria-expanded="true"');
  });

  test('start the lines of a folded block hidden, with the blank lines inside it, and no others', () => {
    const hidden = [...html.matchAll(/<div class="([^"]*)"[^>]*data-line="(\d+)"/g)].filter((m) => m[1].split(' ').includes('sk-hide')).map((m) => Number(m[2]));
    expect(hidden).toEqual([4, 5, 6, 7, 8, 13, 14, 15, 16, 17]);
  });

  test('sum up a folded block on its header: tags in order, repeats counted, only danger notes kept', () => {
    expect(summary(html, 3)).toEqual(['write:postgres.stock ×2 [!no lock]', 'fail:OutOfStock']);
  });

  test('take in nested blocks and change tags, leave out labels, and dim effects on removed lines', () => {
    expect(summary(html, 12)).toEqual(['write:stripe ← body', 'new', 'read:stripe-webhooks', 'write:sendgrid', 'removed']);
    expect(row(html, 12)).toMatch(/<span class="sk-tagw sk-rolled sk-rolled-removed" title="On line 17, removed by the change">/);
    expect(rowClasses(html, 12)).toEqual(expect.arrayContaining(['sk-ch-in', 'sk-ch-in-new']));
  });

  test('name the labeled variables that reach a pill, underlined like their other uses', () => {
    expect(row(html, 12)).toContain(
      '<span class="sk-flow" title="body (untrusted) reaches this effect"><span class="sk-arrow">← </span><span class="sk-var sk-lbl sk-lbl-untrusted" data-var="body" title="untrusted">body</span></span>',
    );
  });

  test('say which lines a summary pill comes from', () => {
    expect(row(html, 3)).toContain('title="On lines 5 and 8"');
  });

  test('give a block of lines the renderer drops no chevron', () => {
    const only = toHtml(['view: code', 'f(x):', '    if x:', '        ::src[app.py:3]', '    g(x)'].join('\n'));
    expect(only).not.toContain('sk-fold');
  });
});
