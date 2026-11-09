/// <reference types="node" />
import { globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseData } from '@skeudo/core';
import { describe, expect, test } from 'vitest';
import { toHast, toHtml } from '../src';

const FIXTURES = fileURLToPath(new URL('../../../spec/fixtures/data/', import.meta.url));
const CSS = readFileSync(new URL('../src/data/data.css', import.meta.url), 'utf8');
const CHECKOUT = readFileSync(join(FIXTURES, 'examples/checkout.skeudo'), 'utf8');

/** The markup of one table, by name. */
function table(html: string, name: string): string {
  const m = new RegExp(`<section class="skd-table" data-skd-table="${name}">([\\s\\S]*?)</section>`).exec(html);
  if (!m) throw new Error(`no table ${name}`);
  return m[1];
}

/** The body of a table that shows the given step, with whether it is hidden. */
function body(html: string, name: string, step: number): { hidden: boolean; rows: string[] } {
  const m = new RegExp(`<tbody data-skd-at="${step}"( hidden)?>([\\s\\S]*?)</tbody>`).exec(table(html, name));
  if (!m) throw new Error(`no step ${step} in ${name}`);
  return { hidden: !!m[1], rows: m[2].split('</tr>').filter(Boolean) };
}

describe('a rendered data sketch', () => {
  const html = toHtml(CHECKOUT);

  test('is one element that carries its number of steps and the step it shows', () => {
    expect(html).toMatch(/^<div class="skd" data-skd data-skd-steps="6" data-skd-step="5" tabindex="-1">/);
    const hast = toHast(CHECKOUT);
    expect(hast.tagName).toBe('div');
    expect(hast.properties.className).toEqual(['skd']);
  });

  test('shows the last step without a script, and holds every step', () => {
    for (let step = 0; step < 6; step++) expect(body(html, 'order', step).hidden).toBe(step !== 5);
    expect(html).toContain('<li class="skd-step skd-cur" data-skd-at="5"');
    expect(html).toContain('<li class="skd-step skd-past" data-skd-at="0"');
    expect(html).toContain('aria-current="step"');
  });

  test('marks what each step adds, changes and deletes', () => {
    expect(body(html, 'payment', 0).rows).toHaveLength(2);
    expect(body(html, 'payment', 1).rows[0]).toContain('<tr class="skd-new" data-skd-row="payment:p1">');
    const paid = body(html, 'order', 2).rows[0];
    expect(paid).toContain('<td class="skd-chg" title="was pending">paid</td>');
    expect(paid).toContain('<td class="skd-chg" title="was p1"><span class="skd-ref" data-skd-ref="payment:p2">p2</span></td>');
    expect(body(html, 'payment', 5).rows[0]).toContain('<tr class="skd-removed" data-skd-row="payment:p1">');
    // A deleted row is gone from the step after; no step comes after this one, so this checks the one before.
    expect(body(html, 'payment', 4).rows.map((r) => r.includes('skd-removed'))).toEqual([false, false]);
  });

  test('reserves room in every step for the most rows a table ever holds', () => {
    for (let step = 0; step < 6; step++) expect(body(html, 'payment', step).rows).toHaveLength(2);
    expect(body(html, 'payment', 0).rows[0]).toContain('<td class="skd-id">empty</td>');
    expect(body(html, 'shipment', 4).rows).toHaveLength(1);
  });

  test('gives a table the sum of its columns as its width, so a narrow space scrolls it rather than squeezing it', () => {
    for (const name of ['customer', 'order', 'payment', 'shipment']) {
      const markup = table(html, name);
      const cols = [...markup.matchAll(/<col style="width:calc\(([\d.]+)ch \+ 16px\)">/g)].map((m) => Number(m[1]));
      const total = /<table class="skd-grid" style="width:calc\(([\d.]+)ch \+ (\d+)px\)">/.exec(markup)!;
      expect(Number(total[1])).toBeCloseTo(cols.reduce((a, b) => a + b, 0), 6);
      expect(Number(total[2])).toBe(16 * cols.length);
    }
  });

  test('keeps explanations out of sight, for the popover', () => {
    // Only in the attribute the popover reads.
    expect(html.split('One account.')).toHaveLength(2);
    expect(html).toContain('data-skd-doc="One account. A guest gets a row too, with no email."');
    expect(html).toContain('data-skd-doc="The declined payment stays for the records, and the order points at the new one."');
    // A mark only where there is an explanation: three tables and two steps.
    expect(html.match(/class="skd-mark"/g)).toHaveLength(5);
    expect(table(html, 'shipment')).not.toContain('skd-mark');
  });

  test('shows empty values as a dash, and references as chips', () => {
    expect(body(html, 'customer', 0).rows[0]).toContain('<td><span class="skd-null">–</span></td>');
    expect(body(html, 'order', 0).rows[0]).toContain('<span class="skd-ref" data-skd-ref="customer:c1">c1</span>');
  });

  test('has no warnings', () => {
    expect(html).not.toContain('skd-warnings');
  });
});

describe('edge cases', () => {
  test('a paragraph break in an explanation is a blank line', () => {
    const html = toHtml(readFileSync(join(FIXTURES, 'format/explanations.skeudo'), 'utf8'));
    expect(html).toContain('data-skd-doc="Metadata for one stored file. Sources point here.\n\nA second paragraph."');
  });

  test('a value longer than the cap is cut at the column width, with all of it in the tooltip', () => {
    const long = 'So the way I would describe my last role is mostly as a facilitator';
    const html = toHtml(`data\nsource(transcript)\n\nTranscribed\n  + source s1  transcript: ${long}\n`);
    expect(html).toContain(`<td title="${long}"><span class="skd-long">${long}</span></td>`);
    const cap = /\.skd-long \{[^}]*max-width: (\d+)ch;/.exec(CSS)![1];
    expect(table(html, 'source')).toContain(`<col style="width:calc(${cap}ch + 16px)">`);
  });

  test('a reference to a row that is not there is drawn broken, and warnings are listed with their lines', () => {
    const html = toHtml('data\nmedia(role)\nsource(input -> media)\n\nUpload\n  + source s1  input: m9\n');
    expect(html).toContain('<span class="skd-ref skd-broken" data-skd-ref="media:m9">m9</span>');
    expect(html).toContain('<ul class="skd-warnings"><li>Line 6: source s1.input points at media m9, which doesn&#39;t exist at step 1.</li></ul>');
  });

  test('a sketch with no steps draws its tables empty, with no story', () => {
    const html = toHtml(readFileSync(join(FIXTURES, 'story/no-steps.skeudo'), 'utf8'));
    expect(html).toMatch(/^<div class="skd" data-skd data-skd-steps="0"><div class="skd-body skd-no-story">/);
    expect(html).toContain('<tbody data-skd-at="0"><tr class="skd-slot"><td class="skd-id">empty</td><td></td></tr></tbody>');
  });

  test('every fixture renders, with one body per step in each table', () => {
    for (const name of globSync('**/*.skeudo', { cwd: FIXTURES })) {
      const source = readFileSync(join(FIXTURES, name), 'utf8');
      const sketch = parseData(source);
      const html = toHtml(source);
      for (const t of sketch.tables) {
        expect(table(html, t.name).match(/<tbody /g), name).toHaveLength(Math.max(1, sketch.steps.length));
      }
    }
  });
});
