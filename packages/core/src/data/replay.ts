import type { Diagnostic } from '../diagnostic';
import type { DataRow, DataSketch, DataState, DataValues } from './types';

/** A row while the story plays, with the line that set each of its values. */
interface LiveRow extends DataRow {
  set: Record<string, number>;
}

type Story = Pick<DataSketch, 'tables' | 'steps'>;

/** The rows of every table after each step of the story, one state per step. */
export function replayData(sketch: Story): DataState[] {
  return play(sketch).states;
}

/**
 * The problems that show only when the story plays: changes to unknown tables, columns or rows, and
 * references to rows that don't exist. A broken reference usually stays broken in the steps after, so
 * each one is reported once, at the line that set the value.
 */
export function checkData(sketch: Story): Diagnostic[] {
  return play(sketch).problems;
}

function play({ tables, steps }: Story): { states: DataState[]; problems: Diagnostic[] } {
  const columns = new Map(tables.map((t) => [t.name, new Set(t.columns.map((c) => c.name))]));
  const rows = new Map<string, LiveRow[]>(tables.map((t) => [t.name, []]));
  const states: DataState[] = [];
  const problems: Diagnostic[] = [];
  const warn = (line: number, message: string) => problems.push({ line, severity: 'warning', message });
  const reported = new Set<string>();

  steps.forEach((step, i) => {
    // The rows the step before deleted are gone now, and nothing is new or changed any more.
    for (const [name, list] of rows) {
      const kept = list.filter((r) => r.status !== 'removed');
      for (const r of kept) {
        delete r.status;
        r.was = {};
      }
      rows.set(name, kept);
    }

    for (const { op, table, id, values, line } of step.changes) {
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
        // A row added and deleted in the same step never shows.
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

    // Every reference must point at a row that exists at this step.
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
          warn(r.set[c.name], `${t.name} ${r.id}.${c.name} points at ${c.ref} ${value}, which doesn't exist at step ${i + 1}.`);
        }
      }
    }

    states.push(
      new Map(
        [...rows].map(([name, list]) => [
          name,
          list.map(({ id, values, status, was }) => ({ id, values: { ...values }, ...(status ? { status } : {}), was: { ...was } })),
        ]),
      ),
    );
  });

  return { states, problems };
}
