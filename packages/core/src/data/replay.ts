import type { Diagnostic } from '../diagnostic.ts';
import type { DataChange, DataFound, DataFrame, DataRead, DataRow, DataSketch, DataState, DataValues } from './types.ts';

/** A row while the story plays, with the line that set each of its values. */
interface LiveRow extends DataRow {
  set: Record<string, number>;
}

type Story = Pick<DataSketch, 'tables' | 'steps'>;

/**
 * Plays the story, frame by frame: one frame for each substep, and one for each step without substeps.
 * Each frame has the rows of every table after its changes, colored against the frame before, and the
 * rows each of its reads finds at its line.
 */
export function replayData(sketch: Story): DataFrame[] {
  return play(sketch).frames;
}

/**
 * The problems that show only when the story plays: changes and reads of unknown tables, columns or rows,
 * and references to rows that don't exist. A broken reference usually stays broken in the frames after,
 * so each one is reported once, at the line that set the value.
 */
export function checkData(sketch: Story): Diagnostic[] {
  return play(sketch).problems;
}

function play({ tables, steps }: Story): { frames: DataFrame[]; problems: Diagnostic[] } {
  const columns = new Map(tables.map((t) => [t.name, new Set(t.columns.map((c) => c.name))]));
  const folders = new Set(tables.filter((t) => t.kind === 'folder').map((t) => t.name));
  const rows = new Map<string, LiveRow[]>(tables.map((t) => [t.name, []]));
  const frames: DataFrame[] = [];
  const problems: Diagnostic[] = [];
  const warn = (line: number, message: string) => problems.push({ line, severity: 'warning', message });
  const reported = new Set<string>();

  /** The rows a read finds now. */
  function find(read: DataRead): string[] {
    const { table, id, prefix, match, line } = read;
    const known = columns.get(table);
    if (!known) {
      warn(line, `No table named ${table}.`);
      return [];
    }
    for (const column of Object.keys(match ?? {})) if (!known.has(column)) warn(line, `${table} has no column ${column}.`);
    if (prefix !== undefined && !folders.has(table)) warn(line, `${table} isn't a folder, so it has no paths to list.`);
    const found = rows
      .get(table)!
      .filter((r) => r.status !== 'removed')
      .filter((r) => {
        if (id !== undefined) return r.id === id;
        if (prefix !== undefined) return r.id.startsWith(prefix);
        // A column the table doesn't have matches nothing.
        return Object.entries(match ?? {}).every(([column, value]) => known.has(column) && (r.values[column] ?? null) === value);
      })
      .map((r) => r.id);
    if (id !== undefined && !found.length) warn(line, `${table} ${id} doesn't exist at this step.`);
    return found;
  }

  /** A frame for each substep, or for the whole step when it has none, named as in warnings: 4, or 4.2. */
  const parts = steps.flatMap((step, i): { step: number; substep?: number; name: string; changes: DataChange[]; reads: DataRead[] }[] =>
    step.substeps.length
      ? step.substeps.map((sub, k) => ({ step: i, substep: k, name: `${i + 1}.${k + 1}`, changes: sub.changes, reads: sub.reads }))
      : [{ step: i, name: String(i + 1), changes: step.changes, reads: step.reads }],
  );

  for (const part of parts) {
    // The rows the frame before deleted are gone now, and nothing is new or changed any more.
    for (const [name, list] of rows) {
      const kept = list.filter((r) => r.status !== 'removed');
      for (const r of kept) {
        delete r.status;
        r.was = {};
      }
      rows.set(name, kept);
    }

    // Changes and reads in the order they are written, so a read finds the rows as they are at its line.
    const ordered: (DataChange | DataRead)[] = [...part.changes, ...part.reads].sort((a, b) => a.line - b.line);
    const reads: DataFound[] = [];
    for (const item of ordered) {
      if (!('op' in item)) {
        reads.push({ ...item, found: find(item) });
        continue;
      }
      const { op, table, id, values, line } = item;
      const known = columns.get(table);
      if (!known) {
        warn(line, `No table named ${table}.`);
        continue;
      }
      const set: DataValues = {};
      for (const [column, value] of Object.entries(values)) {
        if (known.has(column)) set[column] = value;
        else warn(line, `${table} has no column ${column}.`);
      }
      const list = rows.get(table)!;
      const row = list.find((r) => r.id === id && r.status !== 'removed');
      const lines = Object.fromEntries(Object.keys(set).map((column) => [column, line]));
      if (op === '+') {
        if (row) warn(line, `${table} ${id} already exists.`);
        else list.push({ id, values: set, status: 'new', was: {}, set: lines });
      } else if (!row) {
        warn(line, `${table} ${id} doesn't exist at this step.`);
      } else if (op === '-') {
        // A row added and deleted in the same frame never shows.
        if (row.status === 'new') list.splice(list.indexOf(row), 1);
        else row.status = 'removed';
      } else {
        for (const [column, value] of Object.entries(set)) {
          if (row.status !== 'new' && !(column in row.was)) row.was[column] = row.values[column] ?? null;
          row.values[column] = value;
        }
        Object.assign(row.set, lines);
      }
    }

    // Every reference must point at a row that exists in this frame.
    for (const t of tables) {
      for (const r of rows.get(t.name)!) {
        if (r.status === 'removed') continue;
        for (const c of t.columns) {
          const value = r.values[c.name];
          const target = c.ref === undefined ? undefined : rows.get(c.ref);
          if (!value || !target || target.some((x) => x.id === value && x.status !== 'removed')) continue;
          const key = [t.name, r.id, c.name, value].join('\0');
          if (reported.has(key)) continue;
          reported.add(key);
          warn(r.set[c.name], `${t.name} ${r.id}.${c.name} points at ${c.ref} ${value}, which doesn't exist at step ${part.name}.`);
        }
      }
    }

    const state: DataState = new Map(
      [...rows].map(([name, list]) => [
        name,
        list.map(({ id, values, status, was }) => ({ id, values: { ...values }, ...(status ? { status } : {}), was: { ...was } })),
      ]),
    );
    frames.push({ step: part.step, ...(part.substep === undefined ? {} : { substep: part.substep }), state, reads });
  }

  return { frames, problems };
}
