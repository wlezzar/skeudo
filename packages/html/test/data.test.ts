/// <reference types="node" />
import { globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseData, replayData } from '@skeudo/core';
import { describe, expect, test } from 'vitest';
import { toHast, toHtml } from '../src/index.ts';

const FIXTURES = fileURLToPath(new URL('../../../spec/fixtures/data/', import.meta.url));
const CSS = readFileSync(new URL('../src/data/data.css', import.meta.url), 'utf8');
const CHECKOUT = readFileSync(join(FIXTURES, 'examples/checkout.skeudo'), 'utf8');

/** The markup of one table or folder, by name. */
function table(html: string, name: string): string {
  const m = new RegExp(`<section class="skd-(?:table|folder)" data-skd-table="${name}">([\\s\\S]*?)</section>`).exec(html);
  if (!m) throw new Error(`no table ${name}`);
  return m[1];
}

/** The body of a table that shows the given frame, with whether it is hidden. */
function body(html: string, name: string, frame: number): { hidden: boolean; rows: string[] } {
  const m = new RegExp(`<tbody data-skd-at="${frame}"( hidden)?>([\\s\\S]*?)</tbody>`).exec(table(html, name));
  if (!m) throw new Error(`no frame ${frame} in ${name}`);
  return { hidden: !!m[1], rows: m[2].split('</tr>').filter(Boolean) };
}

describe('a rendered data sketch', () => {
  const html = toHtml(CHECKOUT);

  test('is one element that carries its number of frames and the frame it shows', () => {
    expect(html).toMatch(/^<div class="skd" data-skd data-skd-frames="6" data-skd-frame="5" tabindex="-1">/);
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
    const html = toHtml(`view: data\ntable source(transcript)\n\nTranscribed\n  + source s1  transcript: ${long}\n`);
    expect(html).toContain(`<td title="${long}"><span class="skd-long">${long}</span></td>`);
    const cap = /\.skd-long \{[^}]*max-width: (\d+)ch;/.exec(CSS)![1];
    expect(table(html, 'source')).toContain(`<col style="width:calc(${cap}ch + 16px)">`);
  });

  test('a reference to a row that is not there is drawn broken, and warnings are listed with their lines', () => {
    const html = toHtml('view: data\ntable media(role)\ntable source(input -> media)\n\nUpload\n  + source s1  input: m9\n');
    expect(html).toContain('<span class="skd-ref skd-broken" data-skd-ref="media:m9">m9</span>');
    expect(html).toContain('<ul class="skd-warnings"><li>Line 6: source s1.input points at media m9, which doesn&#39;t exist at step 1.</li></ul>');
  });

  test('a sketch with no steps draws its tables empty, with no story', () => {
    const html = toHtml(readFileSync(join(FIXTURES, 'story/no-steps.skeudo'), 'utf8'));
    expect(html).toMatch(/^<div class="skd" data-skd data-skd-frames="0"><div class="skd-body skd-no-story">/);
    expect(html).toContain('<tbody data-skd-at="0"><tr class="skd-slot"><td class="skd-id">empty</td><td></td></tr></tbody>');
  });

  test('every fixture renders, with one body per frame in each table', () => {
    for (const name of globSync('**/*.skeudo', { cwd: FIXTURES })) {
      const source = readFileSync(join(FIXTURES, name), 'utf8');
      const sketch = parseData(source);
      const frames = replayData(sketch).length;
      expect(frames, name).toBe(sketch.steps.reduce((n, s) => n + Math.max(1, s.substeps.length), 0));
      const html = toHtml(source);
      for (const t of sketch.tables) {
        expect(table(html, t.name).match(/<tbody /g), name).toHaveLength(Math.max(1, frames));
      }
    }
  });
});

describe('folders', () => {
  const html = toHtml(readFileSync(join(FIXTURES, 'format/folders.skeudo'), 'utf8'));

  test('a folder has its name in a tab, ending with a slash, on top of its files', () => {
    expect(html).toContain(
      '<section class="skd-folder" data-skd-table="uploads"><div class="skd-name"><span>uploads<span class="skd-slash">/</span></span></div><div class="skd-files"><table class="skd-grid"',
    );
    expect(html).toContain('<section class="skd-table" data-skd-table="media">');
  });

  test('a file shows its path, with the folders it shares with the line above dimmed', () => {
    const [raw, copy] = body(html, 'uploads', 1).rows;
    expect(raw).toContain('<td class="skd-id skd-path">ana/m1/raw.mp4</td>');
    expect(copy).toContain('<td class="skd-id skd-path"><span class="skd-same">ana/m1/</span>720p.mp4</td>');
  });

  test('files are added, overwritten and deleted like rows', () => {
    expect(body(html, 'uploads', 0).rows[0]).toContain('<tr class="skd-new" data-skd-row="uploads:ana/m1/raw.mp4">');
    const [raw, copy] = body(html, 'uploads', 2).rows;
    expect(raw).toContain('<tr class="skd-removed" data-skd-row="uploads:ana/m1/raw.mp4">');
    expect(copy).toContain('<td class="skd-chg" title="was 18 MB">16 MB</td>');
  });

  test('a reference to a file shows its name, with the whole path in the tooltip', () => {
    expect(body(html, 'media', 1).rows[0]).toContain(
      '<td class="skd-chg" title="ana/m1/720p.mp4\nwas ana/m1/raw.mp4"><span class="skd-ref" data-skd-ref="uploads:ana/m1/720p.mp4">720p.mp4</span></td>',
    );
  });

  test('a folder may have no columns', () => {
    expect(body(html, 'tmp', 0).rows[0]).toBe('<tr class="skd-new" data-skd-row="tmp:chunks/m1.part"><td class="skd-id skd-path">chunks/m1.part</td>');
  });
});

describe('groups', () => {
  const html = toHtml(readFileSync(join(FIXTURES, 'format/groups.skeudo'), 'utf8'));

  /** The tables of the group with the given label, in order. */
  const tablesIn = (label: string) => {
    const frame = html.split(`<section class="skd-group" data-skd-group="${label}">`)[1].split('<section class="skd-group"')[0];
    return [...frame.matchAll(/data-skd-table="([^"]+)"/g)].map((m) => m[1]);
  };

  test('frames hold their tables, after the tables in no group', () => {
    const order = [...html.matchAll(/data-skd-(group|table)="([^"]+)"/g)].map((m) => `${m[1]} ${m[2]}`);
    expect(order).toEqual(['table customer', 'group Checkout', 'table order', 'table payment', 'group Billing / S3', 'table invoices']);
    expect(tablesIn('Checkout')).toEqual(['order', 'payment']);
    expect(tablesIn('Billing / S3')).toEqual(['invoices']);
    expect(html).toContain('<div class="skd-group-name"><span>Checkout</span></div><div class="skd-group-body">');
  });

  test("a group's explanation is behind its mark, for the popover", () => {
    const explained = toHtml(readFileSync(join(FIXTURES, 'format/group-explanation.skeudo'), 'utf8'));
    expect(explained).toContain(
      '<div class="skd-group-name" data-skd-doc="Rebuilt from orders by a job a few seconds after each write.\n\nNever written by the app itself."><span>Search index</span><button type="button" class="skd-mark" aria-label="Explanation"></button></div>',
    );
  });

  test('a long label is cut, with the whole label in its tooltip', () => {
    const label = 'Everything the nightly accounting export reads';
    const long = toHtml(`view: data\n[${label}]\ntable order(state)\n`);
    expect(long).toContain(`<span title="${label}">${label}</span>`);
    const cap = /\.skd-group-name > span:first-child \{[^}]*max-width: (\d+)ch;/.exec(CSS)![1];
    expect(cap).toBe(/\.skd-long \{[^}]*max-width: (\d+)ch;/.exec(CSS)![1]);
  });

  test('a sketch without groups has no frames', () => {
    expect(toHtml(CHECKOUT)).not.toContain('skd-group');
  });
});

describe('substeps', () => {
  // Frames: step 1 is 0 and 1, steps 2 and 3 are 2 and 3, step 4 is 4 to 6, step 5 is 7 and 8, steps 6 and 7 are 9 and 10, step 8 is 11 and 12.
  const html = toHtml(readFileSync(join(FIXTURES, 'examples/reads.skeudo'), 'utf8'));

  test('each substep is a frame, and the last one shows without a script', () => {
    expect(html).toMatch(/^<div class="skd" data-skd data-skd-frames="13" data-skd-frame="12" tabindex="-1">/);
    for (let frame = 0; frame < 13; frame++) expect(body(html, 'payment', frame).hidden).toBe(frame !== 12);
  });

  test('a step lists its substeps under its title, and carries the range of their frames', () => {
    expect(html).toContain(
      '<li class="skd-step skd-multi skd-past" data-skd-first="0" data-skd-last="1"><div class="skd-head"><button type="button" class="skd-go"><span class="skd-n">1</span><span class="skd-title">Ana checks out</span></button></div><ol class="skd-subs">',
    );
    expect(html).toContain('<li class="skd-sub skd-past" data-skd-at="4"><button type="button" class="skd-go"><span class="skd-title">Checkout finds her by email</span></button></li>');
    expect(html).toContain('<li class="skd-step skd-multi skd-cur" data-skd-first="11" data-skd-last="12">');
    expect(html).toContain('<li class="skd-sub skd-cur" data-skd-at="12"><button type="button" class="skd-go" aria-current="step"><span class="skd-title">It deletes them</span></button></li>');
    // A step without substeps is one item, as before.
    expect(html).toContain('<li class="skd-step skd-past" data-skd-at="2"><button type="button" class="skd-go"><span class="skd-n">2</span>');
    expect(html.match(/aria-current/g)).toHaveLength(1);
  });

  test("a step's explanation is on its title, and a substep's on the substep", () => {
    expect(html).toContain('<div class="skd-head" data-skd-doc="A nightly job, outside any request."><button');
    expect(html).toContain(
      '<li class="skd-sub skd-past" data-skd-at="11" data-skd-doc="The age check isn&#39;t shown."><button type="button" class="skd-go"><span class="skd-title">It finds the declined payments</span></button><button type="button" class="skd-mark" aria-label="Explanation"></button></li>',
    );
  });

  test('each substep shows only its own changes', () => {
    const [p1, p2, p3] = body(html, 'payment', 5).rows;
    expect(p3).toContain('<tr class="skd-new" data-skd-row="payment:p3">');
    expect(body(html, 'order', 5).rows.every((r) => !r.includes('skd-new'))).toBe(true);
    expect(body(html, 'order', 6).rows[1]).toContain('<tr class="skd-new" data-skd-row="order:o2">');
    expect(body(html, 'payment', 6).rows[2]).not.toContain('skd-new');
    expect(p1).toMatch(/^<tr data-skd-row="payment:p1">/);
    expect(p2).toMatch(/^<tr data-skd-row="payment:p2">/);
  });
});

describe('reads', () => {
  const html = toHtml(readFileSync(join(FIXTURES, 'examples/reads.skeudo'), 'utf8'));

  test('a row a read finds is ringed, and what it matched on is marked', () => {
    // ? customer email: ana@example.com, at frame 4.
    const [c1] = body(html, 'customer', 4).rows;
    expect(c1).toContain('<tr class="skd-read" data-skd-row="customer:c1"><td class="skd-id">c1</td><td>Ana</td><td class="skd-read-key">ana@example.com</td>');
    expect(body(html, 'customer', 5).rows[0]).not.toContain('skd-read');
    // ? order customer: c1, a reference.
    expect(body(html, 'order', 7).rows[1]).toContain('<td class="skd-read-key"><span class="skd-ref" data-skd-ref="customer:c1">c1</span></td>');
    // ? payment p2 and ? payment p3: the ids.
    const [p1, p2, p3] = body(html, 'payment', 8).rows;
    expect(p1).toContain('<tr data-skd-row="payment:p1"><td class="skd-id">p1</td>');
    expect(p2).toContain('<tr class="skd-read" data-skd-row="payment:p2"><td class="skd-id skd-read-key">p2</td>');
    expect(p3).toContain('<tr class="skd-read" data-skd-row="payment:p3"><td class="skd-id skd-read-key">p3</td>');
  });

  test('a row found, then deleted in the next substep', () => {
    expect(body(html, 'payment', 11).rows[0]).toContain('<tr class="skd-read" data-skd-row="payment:p1">');
    expect(body(html, 'payment', 12).rows[0]).toContain('<tr class="skd-removed" data-skd-row="payment:p1">');
  });

  test('a read that finds nothing has a badge beside its table, and the lookup underlines its columns, at its frames', () => {
    expect(table(html, 'customer')).toContain(
      '<div class="skd-name" data-skd-doc="One account per email."><span>customer</span><button type="button" class="skd-mark" aria-label="Explanation"></button><span class="skd-nomatch" data-skd-on="0">no match</span></div>',
    );
    expect(table(html, 'customer')).toContain('<th>name</th><th data-skd-on="0 4">email</th>');
    expect(table(html, 'payment')).not.toContain('skd-nomatch');
  });

  test('what shows at the last frame is on without a script', () => {
    const story = toHtml(readFileSync(join(FIXTURES, 'story/reads.skeudo'), 'utf8'));
    expect(table(story, 'media')).toContain('<span class="skd-nomatch skd-on" data-skd-on="1 2">no match</span>');
    expect(table(story, 'media')).toContain('<th class="skd-on" data-skd-on="1 2">owner</th><th class="skd-on" data-skd-on="1 2">role</th><th data-skd-on="1">note</th>');
  });

  test('a listing marks the prefix of each path it finds, and a read by path the whole path', () => {
    const uploads = toHtml(readFileSync(join(FIXTURES, 'examples/substeps.skeudo'), 'utf8'));
    const [raw, photo, copy] = body(uploads, 'uploads', 5).rows;
    expect(raw).toContain('<tr class="skd-read" data-skd-row="uploads:ana/m1/raw.mp4"><td class="skd-id skd-path"><span class="skd-read-key">ana/</span>m1/raw.mp4</td>');
    expect(photo).toContain('<tr data-skd-row="uploads:ben/m2/raw.jpg">');
    expect(copy).toContain('<td class="skd-id skd-path"><span class="skd-read-key">ana/</span>m1/720p.mp4</td>');
    const story = toHtml(readFileSync(join(FIXTURES, 'story/reads.skeudo'), 'utf8'));
    const [m1, m2] = body(story, 'uploads', 2).rows;
    // The listing keeps the folders it doesn't cover dimmed.
    expect(m1).toContain('<td class="skd-id skd-path"><span class="skd-read-key">ana/</span>m1/raw.mp4</td>');
    expect(m2).toContain('<tr class="skd-removed skd-read" data-skd-row="uploads:ana/m2/raw.mp4"><td class="skd-id skd-path skd-read-key"><span class="skd-same">ana/</span>m2/raw.mp4</td>');
    const [, , m3] = body(story, 'uploads', 1).rows;
    expect(m3).toContain('<tr data-skd-row="uploads:ben/m3/raw.mp4"><td class="skd-id skd-path">ben/m3/raw.mp4</td>');
  });

  test('the legend has a read entry only when the sketch reads', () => {
    expect(html).toContain('<span class="skd-l-del">deleted</span><span class="skd-l-read">read</span></div>');
    expect(toHtml(CHECKOUT)).not.toContain('skd-l-read');
  });
});
