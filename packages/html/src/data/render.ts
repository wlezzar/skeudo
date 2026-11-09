/*
 * Renders a data sketch: the steps of its story beside its tables. Every step's rows are in the
 * markup, one table body per step, and all but one are hidden. Without a script the last step shows;
 * enhance() (data/enhance.ts) starts at the first and switches steps by toggling which body shows.
 *
 * Nothing may move between steps, and a renderer can't measure the page. So each table reserves room
 * for the most rows it ever holds, and each column and table gets a width estimated generously in `ch`
 * from the widest values across all steps. A column whose values are wider than estimated still grows
 * rather than cut them off. Only values longer than the cap are cut, with the whole value in the cell's
 * tooltip.
 */
import { replayData, type DataColumn, type DataRow, type DataSketch, type DataState, type DataTable } from '@skeudo/core';
import type { Element as HastElement, ElementContent } from 'hast';
import { h, text } from '../shared/hast';
import { proportionalWidth, textWidth } from '../shared/width';

/** The longest value shown whole, in `ch`. data.css cuts longer ones at the same width. */
const MAX_WIDTH = 24;
/** Horizontal padding of a cell, in pixels: data.css sets 8px on each side. */
const CELL_PADDING = 16;
/** The width a reference's chip adds to its text, in `ch`: its border and padding. */
const CHIP = 1.8;
/**
 * The width of a character of the monospace ids and references, in `ch` of the values' font. They are
 * smaller, but a monospace character is wider than a proportional font's `0` in some fonts.
 */
const MONO = 1.2;

/** What an empty value shows. */
const EMPTY = '–';

/** Builds a data sketch as a hast tree: one `div.skd` element. */
export function dataToHast(sketch: DataSketch): HastElement {
  const states = replayData(sketch);
  const shown = states.length - 1;
  const story = sketch.steps.length
    ? [h('div', { className: ['skd-story'] }, [stepsHast(sketch, shown), navHast(), legendHast()])]
    : [];
  const board = h(
    'div',
    { className: ['skd-board'] },
    sketch.tables.map((t) => tableHast(t, states)),
  );
  const warnings = sketch.diagnostics.length
    ? [h('ul', { className: ['skd-warnings'] }, sketch.diagnostics.map((d) => h('li', {}, text(`Line ${d.line}: ${d.message}`))))]
    : [];
  return h(
    'div',
    {
      className: ['skd'],
      dataSkd: true,
      dataSkdSteps: sketch.steps.length,
      ...(sketch.steps.length ? { dataSkdStep: shown, tabIndex: -1 } : {}),
    },
    [h('div', { className: story.length ? ['skd-body'] : ['skd-body', 'skd-no-story'] }, [...story, board]), ...warnings],
  );
}

function stepsHast(sketch: DataSketch, shown: number): HastElement {
  return h(
    'ol',
    { className: ['skd-steps'] },
    sketch.steps.map((step, i) => {
      const cls = ['skd-step', ...(i === shown ? ['skd-cur'] : i < shown ? ['skd-past'] : [])];
      return h('li', { className: cls, dataSkdAt: i, ...docProps(step.doc) }, [
        h('button', { type: 'button', className: ['skd-go'], ...(i === shown ? { ariaCurrent: 'step' } : {}) }, [
          h('span', { className: ['skd-n'] }, text(String(i + 1))),
          h('span', { className: ['skd-title'] }, text(step.title)),
        ]),
        ...markHast(step.doc),
      ]);
    }),
  );
}

function navHast(): HastElement {
  return h('div', { className: ['skd-nav'] }, [
    h('button', { type: 'button', className: ['skd-prev'], ariaLabel: 'Previous step' }, text('◀')),
    h('button', { type: 'button', className: ['skd-next'], ariaLabel: 'Next step' }, text('▶')),
    h('span', { className: ['skd-keys'] }, text('or ← →')),
  ]);
}

function legendHast(): HastElement {
  const item = (cls: string, label: string) => h('span', { className: [cls] }, text(label));
  return h('div', { className: ['skd-legend'] }, [item('skd-l-new', 'new'), item('skd-l-chg', 'changed'), item('skd-l-del', 'deleted')]);
}

/** A table or step's explanation, for the popover: its paragraphs, separated by a blank line. */
function docProps(doc: string[]) {
  return doc.length ? { dataSkdDoc: doc.join('\n\n') } : {};
}

/** The mark that pins an explanation. Its "i" is drawn by data.css, so copying the page leaves it out. */
function markHast(doc: string[]): HastElement[] {
  return doc.length ? [h('button', { type: 'button', className: ['skd-mark'], ariaLabel: 'Explanation' })] : [];
}

function tableHast(table: DataTable, states: DataState[]): HastElement {
  // Rounded first, so the table's width is exactly the sum of its columns' and no width is left over to share out.
  const widths = columnWidths(table, states).map((w) => Math.round(w * 10) / 10);
  const slots = Math.max(1, ...states.map((s) => s.get(table.name)?.length ?? 0));
  const width = (w: number, columns = 1) => `calc(${Math.round(w * 10) / 10}ch + ${CELL_PADDING * columns}px)`;
  // The table's own width keeps a narrow space from squeezing its columns, which it would do differently
  // at each step. The table scrolls instead.
  const total = width(widths.reduce((a, b) => a + b, 0), widths.length);
  // A table with no story still draws its header and an empty body.
  const bodies = states.length ? states : [new Map<string, DataRow[]>()];
  return h('section', { className: ['skd-table'], dataSkdTable: table.name }, [
    h('div', { className: ['skd-name'], ...docProps(table.doc) }, [h('span', {}, text(table.name)), ...markHast(table.doc)]),
    h('table', { className: ['skd-grid'], style: `width:${total}` }, [
      h('colgroup', {}, widths.map((w) => h('col', { style: `width:${width(w)}` }))),
      h('thead', {}, [h('tr', {}, [h('th', {}), ...table.columns.map((c) => h('th', {}, text(c.name)))])]),
      ...bodies.map((state, i) => {
        const rows = state.get(table.name) ?? [];
        const filler = Array.from({ length: slots - rows.length }, (_, k) => slotHast(table, k === 0 && !rows.length));
        return h('tbody', { dataSkdAt: i, hidden: i !== bodies.length - 1 }, [...rows.map((r) => rowHast(table, r, state)), ...filler]);
      }),
    ]),
  ]);
}

function rowHast(table: DataTable, row: DataRow, state: DataState): HastElement {
  const cls = row.status === 'new' ? { className: ['skd-new'] } : row.status === 'removed' ? { className: ['skd-removed'] } : {};
  return h('tr', { ...cls, dataSkdRow: `${table.name}:${row.id}` }, [
    h('td', { className: ['skd-id'] }, text(row.id)),
    ...table.columns.map((c) => cellHast(c, row, state)),
  ]);
}

function cellHast(column: DataColumn, row: DataRow, state: DataState): HastElement {
  const value = row.values[column.name] ?? null;
  const changed = column.name in row.was;
  const long = value !== null && proportionalWidth(value) > MAX_WIDTH;
  const title = [long ? value : '', changed ? `was ${row.was[column.name] ?? EMPTY}` : ''].filter(Boolean).join('\n');
  const props = { ...(changed ? { className: ['skd-chg'] } : {}), ...(title ? { title } : {}) };
  return h('td', props, valueHast(column, value, state, long));
}

function valueHast(column: DataColumn, value: string | null, state: DataState, long: boolean): ElementContent[] {
  if (value === null) return [h('span', { className: ['skd-null'] }, text(EMPTY))];
  if (long) return [h('span', { className: ['skd-long'] }, text(value))];
  if (column.ref === undefined || value === '') return text(value);
  const target = state.get(column.ref);
  // A reference to a row that isn't there at this step is drawn broken; the warnings say why.
  const broken = !target?.some((r) => r.id === value && r.status !== 'removed');
  return [h('span', { className: broken ? ['skd-ref', 'skd-broken'] : ['skd-ref'], dataSkdRef: `${column.ref}:${value}` }, text(value))];
}

/** A reserved row, so the table keeps its height. The first one says the table is empty when it is. */
function slotHast(table: DataTable, empty: boolean): HastElement {
  return h('tr', { className: ['skd-slot'] }, [
    h('td', { className: ['skd-id'] }, text(empty ? 'empty' : '')),
    ...table.columns.map(() => h('td', {})),
  ]);
}

/**
 * The minimum width of each column, the ids first, in `ch` of the values' font: the widest it gets in
 * any step.
 */
function columnWidths(table: DataTable, states: DataState[]): number[] {
  const rows = states.flatMap((s) => s.get(table.name) ?? []);
  const id = Math.max(textWidth('empty'), ...rows.map((r) => textWidth(r.id))) * MONO;
  const columns = table.columns.map((c) => {
    const values = rows.map((r) => {
      const v = r.values[c.name] ?? null;
      if (v === null) return 1;
      return c.ref !== undefined && v !== '' ? textWidth(v) * MONO + CHIP : Math.min(MAX_WIDTH, proportionalWidth(v));
    });
    // The header's font is smaller, so the values' estimate is enough for it.
    return Math.max(proportionalWidth(c.name), ...values);
  });
  return [id, ...columns];
}
