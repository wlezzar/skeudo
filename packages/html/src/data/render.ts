/*
 * Renders a data sketch: the steps of its story beside its tables. The story plays in frames: one for
 * each substep, and one for each step without substeps. Every frame's rows are in the markup, one table
 * body per frame, and all but one are hidden. Without a script the last frame shows; enhance()
 * (data/enhance.ts) starts at the first and switches frames by toggling which body shows. What else
 * shows at some frames only, such as a "no match" badge, lists them in `data-skd-on`, and has the class
 * `skd-on` while one of them shows.
 *
 * Nothing may move between steps, and a renderer can't measure the page. So each table reserves room
 * for the most rows it ever holds, and each column and table gets a width estimated generously in `ch`
 * from the widest values across all steps. A column whose values are wider than estimated still grows
 * rather than cut them off. Only values longer than the cap are cut, with the whole value in the cell's
 * tooltip.
 *
 * A folder is drawn like a table, with its name in a tab and a path for each row's id. A group is a frame
 * around its tables, drawn where its first table is declared.
 */
import {
  replayData,
  type DataColumn,
  type DataFound,
  type DataFrame,
  type DataGroup,
  type DataRow,
  type DataSketch,
  type DataState,
  type DataTable,
} from '@skeudo/core';
import type { Element as HastElement, ElementContent } from 'hast';
import { h, text } from '../shared/hast.ts';
import { proportionalWidth, textWidth } from '../shared/width.ts';

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
  const frames = replayData(sketch);
  const shown = frames.length - 1;
  const reads = frames.some((f) => f.reads.length);
  const story = frames.length
    ? [h('div', { className: ['skd-story'] }, [stepsHast(sketch, frames, shown), navHast(), legendHast(reads)])]
    : [];
  const folders = new Set(sketch.tables.filter((t) => t.kind === 'folder').map((t) => t.name));
  const groupOf = new Map(sketch.groups.flatMap((g) => g.tables.map((name) => [name, g] as const)));
  const items: HastElement[] = [];
  const drawn = new Set<DataGroup>();
  for (const table of sketch.tables) {
    const group = groupOf.get(table.name);
    if (!group) items.push(tableHast(table, frames, shown, folders));
    else if (!drawn.has(group)) {
      drawn.add(group);
      const tables = sketch.tables.filter((t) => groupOf.get(t.name) === group);
      items.push(groupHast(group, tables.map((t) => tableHast(t, frames, shown, folders))));
    }
  }
  const board = h('div', { className: ['skd-board'] }, items);
  const warnings = sketch.diagnostics.length
    ? [h('ul', { className: ['skd-warnings'] }, sketch.diagnostics.map((d) => h('li', {}, text(`Line ${d.line}: ${d.message}`))))]
    : [];
  return h(
    'div',
    {
      className: ['skd'],
      dataSkd: true,
      dataSkdFrames: frames.length,
      ...(frames.length ? { dataSkdFrame: shown, tabIndex: -1 } : {}),
    },
    [h('div', { className: story.length ? ['skd-body'] : ['skd-body', 'skd-no-story'] }, [...story, board]), ...warnings],
  );
}

/** A group's frame, with its label on top like a table's name. */
function groupHast(group: DataGroup, tables: HastElement[]): HastElement {
  const long = proportionalWidth(group.label) > MAX_WIDTH;
  return h('section', { className: ['skd-group'], dataSkdGroup: group.label }, [
    h('div', { className: ['skd-group-name'], ...docProps(group.doc) }, [
      h('span', long ? { title: group.label } : {}, text(group.label)),
      ...markHast(group.doc),
    ]),
    h('div', { className: ['skd-group-body'] }, tables),
  ]);
}

/**
 * The story. A step without substeps is one item, which carries its frame in `data-skd-at`. A step with
 * substeps lists them under its title, each with its frame, and carries the range of its frames in
 * `data-skd-first` and `data-skd-last`, so it stays current while one of them shows.
 */
function stepsHast(sketch: DataSketch, frames: DataFrame[], shown: number): HastElement {
  const state = (first: number, last: number) => (shown >= first && shown <= last ? ['skd-cur'] : shown > last ? ['skd-past'] : []);
  const current = (at: number) => (at === shown ? { ariaCurrent: 'step' } : {});
  return h(
    'ol',
    { className: ['skd-steps'] },
    sketch.steps.map((step, i) => {
      const first = frames.findIndex((f) => f.step === i);
      const title = (props: object) =>
        h('button', { type: 'button', className: ['skd-go'], ...props }, [
          h('span', { className: ['skd-n'] }, text(String(i + 1))),
          h('span', { className: ['skd-title'] }, text(step.title)),
        ]);
      if (!step.substeps.length) {
        return h('li', { className: ['skd-step', ...state(first, first)], dataSkdAt: first, ...docProps(step.doc) }, [
          title(current(first)),
          ...markHast(step.doc),
        ]);
      }
      const last = first + step.substeps.length - 1;
      return h('li', { className: ['skd-step', 'skd-multi', ...state(first, last)], dataSkdFirst: first, dataSkdLast: last }, [
        h('div', { className: ['skd-head'], ...docProps(step.doc) }, [title({}), ...markHast(step.doc)]),
        h(
          'ol',
          { className: ['skd-subs'] },
          step.substeps.map((sub, k) =>
            h('li', { className: ['skd-sub', ...state(first + k, first + k)], dataSkdAt: first + k, ...docProps(sub.doc) }, [
              h('button', { type: 'button', className: ['skd-go'], ...current(first + k) }, [h('span', { className: ['skd-title'] }, text(sub.title))]),
              ...markHast(sub.doc),
            ]),
          ),
        ),
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

/** The colors of changes, and the ring of a row read when the sketch has reads. */
function legendHast(reads: boolean): HastElement {
  const item = (cls: string, label: string) => h('span', { className: [cls] }, text(label));
  return h('div', { className: ['skd-legend'] }, [
    item('skd-l-new', 'new'),
    item('skd-l-chg', 'changed'),
    item('skd-l-del', 'deleted'),
    ...(reads ? [item('skd-l-read', 'read')] : []),
  ]);
}

/** The properties of an element that shows at some frames only, with the class it starts with. */
function onProps(at: number[], shown: number, cls: string[] = []) {
  const all = [...cls, ...(at.includes(shown) ? ['skd-on'] : [])];
  return { ...(all.length ? { className: all } : {}), ...(at.length ? { dataSkdOn: at.join(' ') } : {}) };
}

/** A table or step's explanation, for the popover: its paragraphs, separated by a blank line. */
function docProps(doc: string[]) {
  return doc.length ? { dataSkdDoc: doc.join('\n\n') } : {};
}

/** The mark that pins an explanation. Its "i" is drawn by data.css, so copying the page leaves it out. */
function markHast(doc: string[]): HastElement[] {
  return doc.length ? [h('button', { type: 'button', className: ['skd-mark'], ariaLabel: 'Explanation' })] : [];
}

/** The last part of a path, which a reference to a file shows. */
const fileName = (path: string) => path.slice(path.lastIndexOf('/') + 1);

function tableHast(table: DataTable, frames: DataFrame[], shown: number, folders: Set<string>): HastElement {
  const folder = table.kind === 'folder';
  const states = frames.map((f) => f.state);
  /** The reads of this table at each frame. */
  const reads = frames.map((f) => f.reads.filter((r) => r.table === table.name));
  /** The frames where the predicate holds for one of this table's reads. */
  const when = (test: (read: DataFound) => boolean) => reads.flatMap((list, i) => (list.some(test) ? [i] : []));
  // A read that finds nothing says so beside the table's name. A lookup's columns are underlined.
  const missed = when((r) => !r.found.length);
  const badge = missed.length ? [h('span', onProps(missed, shown, ['skd-nomatch']), text('no match'))] : [];
  // Rounded first, so the table's width is exactly the sum of its columns' and no width is left over to share out.
  const widths = columnWidths(table, states, folders).map((w) => Math.round(w * 10) / 10);
  const slots = Math.max(1, ...states.map((s) => s.get(table.name)?.length ?? 0));
  const width = (w: number, columns = 1) => `calc(${Math.round(w * 10) / 10}ch + ${CELL_PADDING * columns}px)`;
  // The table's own width keeps a narrow space from squeezing its columns, which it would do differently
  // at each step. The table scrolls instead.
  const total = width(widths.reduce((a, b) => a + b, 0), widths.length);
  // A table with no story still draws its header and an empty body.
  const bodies = states.length ? states : [new Map<string, DataRow[]>()];
  const grid = h('table', { className: ['skd-grid'], style: `width:${total}` }, [
    h('colgroup', {}, widths.map((w) => h('col', { style: `width:${width(w)}` }))),
    h('thead', {}, [
      h('tr', {}, [h('th', {}), ...table.columns.map((c) => h('th', onProps(when((r) => !!r.match && c.name in r.match), shown), text(c.name)))]),
    ]),
    ...bodies.map((state, i) => {
      const rows = state.get(table.name) ?? [];
      const filler = Array.from({ length: slots - rows.length }, (_, k) => slotHast(table, k === 0 && !rows.length));
      const cells = rows.map((r, k) => rowHast(table, r, state, folders, folder ? rows[k - 1]?.id : undefined, reads[i] ?? []));
      return h('tbody', { dataSkdAt: i, hidden: i !== bodies.length - 1 }, [...cells, ...filler]);
    }),
  ]);
  if (!folder) {
    return h('section', { className: ['skd-table'], dataSkdTable: table.name }, [
      h('div', { className: ['skd-name'], ...docProps(table.doc) }, [h('span', {}, text(table.name)), ...markHast(table.doc), ...badge]),
      grid,
    ]);
  }
  // A folder's name ends with a slash, in a tab on top of its files.
  return h('section', { className: ['skd-folder'], dataSkdTable: table.name }, [
    h('div', { className: ['skd-name'], ...docProps(table.doc) }, [
      h('span', {}, [...text(table.name), h('span', { className: ['skd-slash'] }, text('/'))]),
      ...markHast(table.doc),
      ...badge,
    ]),
    h('div', { className: ['skd-files'] }, [grid]),
  ]);
}

/**
 * A row. In a folder, `above` is the path on the line above, whose folders this row's path dims. A row
 * one of `reads` finds is ringed, and what the read matched on is marked: its id, its path's prefix, or
 * the cells of the lookup's columns.
 */
function rowHast(table: DataTable, row: DataRow, state: DataState, folders: Set<string>, above: string | undefined, reads: DataFound[]): HastElement {
  const hits = reads.filter((r) => r.found.includes(row.id));
  const cls = [...(row.status === 'new' ? ['skd-new'] : row.status === 'removed' ? ['skd-removed'] : []), ...(hits.length ? ['skd-read'] : [])];
  const byId = hits.some((r) => r.id !== undefined);
  const prefix = hits.reduce((longest, r) => (r.prefix && r.prefix.length > longest.length ? r.prefix : longest), '');
  const looked = new Set(hits.flatMap((r) => Object.keys(r.match ?? {})));
  return h('tr', { ...(cls.length ? { className: cls } : {}), dataSkdRow: `${table.name}:${row.id}` }, [
    table.kind === 'folder' ? pathHast(row.id, above, prefix, byId) : h('td', { className: ['skd-id', ...(byId ? ['skd-read-key'] : [])] }, text(row.id)),
    ...table.columns.map((c) => cellHast(c, row, state, folders, looked.has(c.name))),
  ]);
}

/**
 * A file's path, with the folders it shares with the path above dimmed, so the layout of the keys stands
 * out. A prefix a read listed is marked instead, and so is the whole path when a read named it.
 */
function pathHast(path: string, above: string | undefined, prefix: string, read: boolean): HastElement {
  const parts = path.split('/');
  const before = above?.split('/') ?? [];
  let shared = 0;
  // The file's own name is never dimmed.
  while (shared < Math.min(parts.length, before.length) - 1 && parts[shared] === before[shared]) shared++;
  const head = parts.slice(0, shared).map((p) => `${p}/`).join('');
  return h('td', { className: ['skd-id', 'skd-path', ...(read ? ['skd-read-key'] : [])] }, [
    ...(prefix ? [h('span', { className: ['skd-read-key'] }, text(prefix))] : []),
    ...(head.length > prefix.length ? [h('span', { className: ['skd-same'] }, text(head.slice(prefix.length)))] : []),
    ...text(path.slice(Math.max(head.length, prefix.length))),
  ]);
}

/** A cell. `read` marks the cell of a column a read looked the row up by. */
function cellHast(column: DataColumn, row: DataRow, state: DataState, folders: Set<string>, read: boolean): HastElement {
  const value = row.values[column.name] ?? null;
  const changed = column.name in row.was;
  // A reference to a file shows the file's name, with the whole path in the tooltip.
  const file = value !== null && column.ref !== undefined && folders.has(column.ref) && value.includes('/');
  const long = value !== null && !file && proportionalWidth(value) > MAX_WIDTH;
  const title = [long || file ? value : '', changed ? `was ${row.was[column.name] ?? EMPTY}` : ''].filter(Boolean).join('\n');
  const cls = [...(changed ? ['skd-chg'] : []), ...(read ? ['skd-read-key'] : [])];
  const props = { ...(cls.length ? { className: cls } : {}), ...(title ? { title } : {}) };
  return h('td', props, valueHast(column, value, state, long, file));
}

function valueHast(column: DataColumn, value: string | null, state: DataState, long: boolean, file: boolean): ElementContent[] {
  if (value === null) return [h('span', { className: ['skd-null'] }, text(EMPTY))];
  if (long) return [h('span', { className: ['skd-long'] }, text(value))];
  if (column.ref === undefined || value === '') return text(value);
  const target = state.get(column.ref);
  // A reference to a row that isn't there at this step is drawn broken; the warnings say why.
  const broken = !target?.some((r) => r.id === value && r.status !== 'removed');
  const shown = file ? fileName(value) : value;
  return [h('span', { className: broken ? ['skd-ref', 'skd-broken'] : ['skd-ref'], dataSkdRef: `${column.ref}:${value}` }, text(shown))];
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
function columnWidths(table: DataTable, states: DataState[], folders: Set<string>): number[] {
  const rows = states.flatMap((s) => s.get(table.name) ?? []);
  const id = Math.max(textWidth('empty'), ...rows.map((r) => textWidth(r.id))) * MONO;
  const columns = table.columns.map((c) => {
    const files = c.ref !== undefined && folders.has(c.ref);
    const values = rows.map((r) => {
      const v = r.values[c.name] ?? null;
      if (v === null) return 1;
      if (c.ref === undefined || v === '') return Math.min(MAX_WIDTH, proportionalWidth(v));
      return textWidth(files ? fileName(v) : v) * MONO + CHIP;
    });
    // The header's font is smaller, so the values' estimate is enough for it.
    return Math.max(proportionalWidth(c.name), ...values);
  });
  return [id, ...columns];
}
