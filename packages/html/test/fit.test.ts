/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { toHtml } from '../src';

const CSS = readFileSync(new URL('../src/code/code.css', import.meta.url), 'utf8');

/** The `sk-fit-*` or `sk-under` class of a rendered line, or undefined. */
function fitOf(html: string, line: number): string | undefined {
  const cls = new RegExp(`<div class="([^"]*)"[^>]* data-line="${line}"`).exec(html)?.[1];
  if (cls === undefined) throw new Error(`no line ${line}`);
  return cls.split(' ').find((c) => c.startsWith('sk-fit-') || c === 'sk-under');
}

const widthOf = (fit: string | undefined) => Number(fit?.replace('sk-fit-', ''));

const CROWDED_TAGS =
  '::write:postgres.durable_job ::write:postgres.attempt ::write?:postgres.media ::changed[now passes a failure code]';

describe('tag column fit', () => {
  test('code.css has a rule for every width the renderer marks', () => {
    const rules = [...CSS.matchAll(/@container sketch \(max-width: (\d+)ch\) \{ \.sk-fit-(\d+) > \.sk-tags \{/g)];
    for (const [, query, cls] of rules) expect(cls).toBe(query);
    const widths = rules.map((r) => Number(r[1]));
    const expected = Array.from({ length: 20 }, (_, i) => 60 + i * 10);
    expect(widths).toEqual(expected);
    expect(CSS).toContain('.sk-under > .sk-tags {');
  });

  test('a line whose tags fit in the narrowest column is not marked', () => {
    const html = toHtml('f(x):\n    y = g(x)          ::read:redis\n');
    expect(fitOf(html, 2)).toBeUndefined();
  });

  test('a crowded line is marked with the box width its tags need, rounded up to 10ch', () => {
    const fit = fitOf(toHtml(`handle(job):\n    fail(job)    ${CROWDED_TAGS}\n`), 2);
    expect(fit).toMatch(/^sk-fit-\d+0$/);
    expect(CSS).toContain(`.${fit} > .sk-tags`);
  });

  test('a wider line of code anywhere in the sketch pushes the tag column right', () => {
    const narrow = toHtml(`handle(job):\n    fail(job)    ${CROWDED_TAGS}\n`);
    const wide = toHtml(
      `handle(job):\n    Settles jobs whose worker was lost on their last try, then marks them failed.\n    fail(job)    ${CROWDED_TAGS}\n`,
    );
    expect(widthOf(fitOf(wide, 3)) - widthOf(fitOf(narrow, 2))).toBeGreaterThanOrEqual(60);
  });

  test('tags too wide for any box always go under the line', () => {
    const note = 'a note long enough that four of them cannot fit in any reasonable box';
    const html = toHtml(`f(x):\n    g(x)    ::read:a[${note}] ::read:b[${note}] ::write:c[${note}] ::write:d[${note}]\n`);
    expect(fitOf(html, 2)).toBe('sk-under');
  });

  test("the signature's file can break after a slash, and counts toward the fit", () => {
    const html = toHtml('start():    ::src[apps/web/src/components/exercise-practice/use-recorder.ts:212-266]\n    go\n');
    expect(html).toContain('apps/<wbr>web/<wbr>src/<wbr>components/<wbr>exercise-practice/<wbr>use-recorder.ts');
    expect(fitOf(html, 1)).toMatch(/^sk-fit-/);
  });
});
