/*
 * The data view's parser. See spec/data.md: Format.
 */
import type { Diagnostic } from '../diagnostic.ts';
import { firstLine, splitLines } from '../header.ts';
import { checkData } from './replay.ts';
import {
  DATA_KINDS,
  type DataChange,
  type DataColumn,
  type DataGroup,
  type DataKind,
  type DataRead,
  type DataSketch,
  type DataStep,
  type DataSubstep,
  type DataTable,
  type DataValues,
} from './types.ts';

const NAME = String.raw`[\p{L}\p{N}_.-]+`;
const KIND = DATA_KINDS.join('|');
/**
 * `table name(` or `folder name(`, the start of a declaration. No space is allowed before the parenthesis,
 * so `Login (Google)` is a step. A declaration without its kind word is still read, as a table, with a warning.
 */
const DECLARATION = new RegExp(String.raw`^(?:(${KIND})\s+)?(${NAME})\(`, 'u');
/** A whole declaration: `table name(…)`. */
const TABLE = new RegExp(String.raw`^(?:(?:${KIND})\s+)?${NAME}\(.*\)$`, 'u');
/** `[label]`, which starts a group. */
const GROUP = /^\[(.*)\]$/;
/** `name`, or `name -> table` (`→` works too). */
const COLUMN = new RegExp(String.raw`^(${NAME})(?:\s*(?:->|→)\s*(${NAME}))?$`, 'u');
/** `+ table id  values`. */
const CHANGE = /^([+~-])\s+(\S+)\s+(\S+)\s*(.*)$/;
/** `? table what`, where what is an id, a path prefix or values. */
const READ = /^\?\s+(\S+)\s*(.*)$/;
/** `column: value`, split at the first colon, so `expires: 10:14` works. */
const VALUE = new RegExp(String.raw`^(${NAME})\s*:\s*(.*)$`, 'u');

/** What indented lines belong to: the table, group, step or substep above them. Only a step or substep has changes and reads. */
interface Owner {
  doc: string[];
  changes?: DataChange[];
  reads?: DataRead[];
}

type Warn = (line: number, message: string) => void;

/**
 * Parses a data block. Lines that aren't indented start a group, as `[label]`, declare a table, as
 * `table name(col, col -> table)` or `folder name(col)`, or start a step. Indented lines under any of them
 * are its explanation, except under a step. There, a line starting with `>` starts a substep, and lines
 * starting with `+`, `~` or `-` and a space are changes and lines starting with `?` are reads, of the
 * substep or step above them. A blank line splits an explanation into paragraphs. A `data` header on the
 * first line is skipped. The diagnostics include what playing the story finds (checkData).
 */
export function parseData(source: string): DataSketch {
  const lines = splitLines(source);
  const diagnostics: Diagnostic[] = [];
  const warn = (line: number, message: string) => diagnostics.push({ line, severity: 'warning', message });
  const tables: DataTable[] = [];
  const groups: DataGroup[] = [];
  const steps: DataStep[] = [];
  let owner: Owner | undefined;
  /** What `owner` is when it isn't a step or substep, for the warning about a change under it. */
  let ownerIs: 'table' | 'group' = 'table';
  /** The step that indented lines are under, if any: `owner` is it or one of its substeps. */
  let step: DataStep | undefined;
  /** The group that tables declared now belong to. Steps don't end it, only the next group line does. */
  let group: DataGroup | undefined;
  /** Whether the line before continues the same paragraph of explanation. */
  let paragraph = false;

  const header = firstLine(lines);
  const start = header?.text === 'data' ? header.index + 1 : 0;

  for (let i = start; i < lines.length; i++) {
    const raw = lines[i];
    const line = i + 1;
    const body = raw.trim();
    if (!body) {
      paragraph = false;
      continue;
    }

    if (!/^\s/.test(raw)) {
      paragraph = false;
      const label = GROUP.exec(body)?.[1].trim();
      if (label !== undefined) {
        if (!label) warn(line, 'A group needs a label, as in [Checkout].');
        else if (groups.some((g) => g.label === label)) warn(line, `There is already a group named ${label}.`);
        group = { label, doc: [], tables: [], line };
        groups.push(group);
        owner = group;
        ownerIs = 'group';
        step = undefined;
        continue;
      }
      const declaration = DECLARATION.exec(body);
      // A title such as `Login(Google) fails` has a closing parenthesis but doesn't end with it.
      if (declaration && (TABLE.test(body) || !body.includes(')'))) {
        const [, word, name] = declaration;
        let text = body;
        if (!body.includes(')')) {
          // A declaration may run over several lines, up to its closing parenthesis.
          while (i + 1 < lines.length && lines[i + 1].trim() && !text.includes(')')) text += ' ' + lines[++i].trim();
          if (!TABLE.test(text)) warn(line, `The declaration of ${name} should end with ), as in table media(role, type).`);
        }
        if (!word) warn(line, `The declaration of ${name} should start with table or folder, as in table ${name}(…).`);
        const inside = text.slice(text.indexOf('(') + 1).replace(/\)[^)]*$/, '');
        const kind = (word ?? 'table') as DataKind;
        const table: DataTable = { kind, name, columns: columns(inside, name, line, warn), doc: [], line };
        if (tables.some((t) => t.name === name)) warn(line, `${name} is declared twice.`);
        else {
          tables.push(table);
          group?.tables.push(name);
        }
        owner = table;
        ownerIs = 'table';
        step = undefined;
        continue;
      }
      step = { title: body, doc: [], changes: [], reads: [], substeps: [], line };
      steps.push(step);
      owner = step;
      continue;
    }

    if (!owner) {
      warn(line, 'This line is indented but has no table or step above it.');
      continue;
    }

    if (/^>(\s|$)/.test(body)) {
      paragraph = false;
      if (!step) {
        warn(line, `Substeps go under a step, not under a ${ownerIs}.`);
        continue;
      }
      const title = body.slice(1).trim();
      if (!title) warn(line, 'A substep needs a title, as in > Checkout looks her email up.');
      const substep: DataSubstep = { title, doc: [], changes: [], reads: [], line };
      step.substeps.push(substep);
      owner = substep;
      continue;
    }

    if (/^[+~-]\s/.test(body)) {
      paragraph = false;
      if (!owner.changes) {
        warn(line, `Changes go under a step, not under a ${ownerIs}.`);
        continue;
      }
      const m = CHANGE.exec(body);
      if (!m) {
        warn(line, 'A change needs a table and a row id, as in + media m1.');
        continue;
      }
      const [, op, table, id, rest] = m;
      let values: DataValues = {};
      if (op === '-' && rest) warn(line, 'A deletion takes no values.');
      else values = parseValues(rest, line, warn);
      owner.changes.push({ op: op as DataChange['op'], table, id, values, line });
      continue;
    }

    if (/^\?(\s|$)/.test(body)) {
      paragraph = false;
      if (!owner.reads) {
        warn(line, `Reads go under a step, not under a ${ownerIs}.`);
        continue;
      }
      const read = parseRead(body, line, warn);
      if (read) owner.reads.push(read);
      continue;
    }

    // Anything else indented is explanation.
    if (paragraph) owner.doc[owner.doc.length - 1] += ' ' + body;
    else owner.doc.push(body);
    paragraph = true;
  }

  // Once a step has substeps, what is written above the first one plays with it.
  for (const s of steps) {
    const [first] = s.substeps;
    if (!first) continue;
    for (const c of s.changes) warn(c.line, 'Changes go under a substep once a step has substeps.');
    for (const r of s.reads) warn(r.line, 'Reads go under a substep once a step has substeps.');
    first.changes.unshift(...s.changes);
    first.reads.unshift(...s.reads);
    s.changes = [];
    s.reads = [];
  }

  const names = new Set(tables.map((t) => t.name));
  for (const t of tables) {
    for (const c of t.columns) {
      if (c.ref !== undefined && !names.has(c.ref)) warn(t.line, `${t.name}.${c.name} points at ${c.ref}, which isn't declared.`);
    }
  }
  // A group with no label has had its warning.
  for (const g of groups) if (g.label && !g.tables.length) warn(g.line, `The group ${g.label} has no tables.`);
  if (!tables.length) warn(header?.index === undefined ? 1 : header.index + 1, 'No tables are declared.');
  diagnostics.push(...checkData({ tables, steps }));
  diagnostics.sort((a, b) => a.line - b.line);

  return { view: 'data', source, tables, groups, steps, diagnostics };
}

/**
 * `? table id`, `? folder prefix/` or `? table col: value | …`. It is a lookup when its first part is
 * `col: value`, a prefix when it ends with a slash, and an id otherwise.
 */
function parseRead(body: string, line: number, warn: Warn): DataRead | undefined {
  const m = READ.exec(body);
  const [table, rest] = m ? [m[1], m[2]] : [];
  if (!table || !rest) {
    warn(line, 'A read needs a row id, a path prefix or col: value, as in ? media m1.');
    return undefined;
  }
  if (VALUE.test(splitPipes(rest)[0].trim())) return { table, match: parseValues(rest, line, warn), line };
  // An id or a prefix is one word.
  if (/[\s|]/.test(rest)) {
    warn(line, 'A read needs a row id, a path prefix or col: value, as in ? media m1.');
    return undefined;
  }
  return rest.endsWith('/') ? { table, prefix: rest, line } : { table, id: rest, line };
}

/** `col: value | col: value`, as a change or a lookup lists them. */
function parseValues(text: string, line: number, warn: Warn): DataValues {
  const values: DataValues = {};
  for (const part of splitPipes(text).map((p) => p.trim())) {
    if (!part) continue;
    const kv = VALUE.exec(part);
    if (kv) values[kv[1]] = parseValue(kv[2].trim());
    else warn(line, `"${part}" should be column: value.`);
  }
  return values;
}

/** The columns between a declaration's parentheses. */
function columns(inside: string, table: string, line: number, warn: Warn): DataColumn[] {
  const out: DataColumn[] = [];
  for (const part of inside.split(',').map((s) => s.trim())) {
    if (!part) continue;
    const m = COLUMN.exec(part);
    if (!m) warn(line, `"${part}" isn't a column: write a name, or name -> table.`);
    else if (out.some((c) => c.name === m[1])) warn(line, `${table} has two columns named ${m[1]}.`);
    else out.push(m[2] === undefined ? { name: m[1] } : { name: m[1], ref: m[2] });
  }
  return out;
}

/** Splits values on `|`, except inside double quotes. */
function splitPipes(text: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    if (ch === '|' && !quoted) {
      parts.push(current);
      current = '';
    } else current += ch;
  }
  parts.push(current);
  return parts;
}

/** `null` is null, and a double-quoted value is taken as written. Anything else is text, as it is. */
function parseValue(text: string): string | null {
  if (text === 'null') return null;
  const quoted = /^"(.*)"$/s.exec(text);
  return quoted ? quoted[1] : text;
}
