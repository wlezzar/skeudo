/*
 * The data view's parser. See spec/data.md: Format.
 */
import type { Diagnostic } from '../diagnostic';
import { firstLine, splitLines } from '../header';
import { checkData } from './replay';
import type { DataChange, DataColumn, DataSketch, DataStep, DataTable, DataValues } from './types';

const NAME = String.raw`[\p{L}\p{N}_.-]+`;
/** `name(`, the start of a declaration. No space is allowed before the parenthesis, so `Login (Google)` is a step. */
const DECLARATION = new RegExp(String.raw`^(${NAME})\(`, 'u');
/** A whole declaration: `name(…)`. */
const TABLE = new RegExp(String.raw`^(${NAME})\((.*)\)$`, 'u');
/** `name`, or `name -> table` (`→` works too). */
const COLUMN = new RegExp(String.raw`^(${NAME})(?:\s*(?:->|→)\s*(${NAME}))?$`, 'u');
/** `+ table id  values`. */
const CHANGE = /^([+~-])\s+(\S+)\s+(\S+)\s*(.*)$/;
/** `column: value`, split at the first colon, so `expires: 10:14` works. */
const VALUE = new RegExp(String.raw`^(${NAME})\s*:\s*(.*)$`, 'u');

/** What indented lines belong to: the table or step above them. Only a step has changes. */
interface Owner {
  doc: string[];
  changes?: DataChange[];
}

/**
 * Parses a data block. Lines that aren't indented declare a table, as `name(col, col -> table)`, or start
 * a step. Indented lines under either are its explanation, except under a step, where lines starting with
 * `+`, `~` or `-` and a space are its changes. A blank line splits an explanation into paragraphs. A `data`
 * header on the first line is skipped. The diagnostics include what playing the story finds (checkData).
 */
export function parseData(source: string): DataSketch {
  const lines = splitLines(source);
  const diagnostics: Diagnostic[] = [];
  const warn = (line: number, message: string) => diagnostics.push({ line, severity: 'warning', message });
  const tables: DataTable[] = [];
  const steps: DataStep[] = [];
  let owner: Owner | undefined;
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
      const name = DECLARATION.exec(body)?.[1];
      // A title such as `Login(Google) fails` has a closing parenthesis but doesn't end with it.
      if (name && (TABLE.test(body) || !body.includes(')'))) {
        let text = body;
        if (!body.includes(')')) {
          // A declaration may run over several lines, up to its closing parenthesis.
          while (i + 1 < lines.length && lines[i + 1].trim() && !text.includes(')')) text += ' ' + lines[++i].trim();
          if (!TABLE.test(text)) warn(line, `The declaration of ${name} should end with ), as in media(role, type).`);
        }
        const inside = text.slice(name.length + 1).replace(/\)[^)]*$/, '');
        const table: DataTable = { name, columns: columns(inside, name, line, warn), doc: [], line };
        if (tables.some((t) => t.name === name)) warn(line, `${name} is declared twice.`);
        else tables.push(table);
        owner = table;
        continue;
      }
      const step: DataStep = { title: body, doc: [], changes: [], line };
      steps.push(step);
      owner = step;
      continue;
    }

    if (!owner) {
      warn(line, 'This line is indented but has no table or step above it.');
      continue;
    }

    if (/^[+~-]\s/.test(body)) {
      paragraph = false;
      if (!owner.changes) {
        warn(line, 'Changes go under a step, not under a table.');
        continue;
      }
      const m = CHANGE.exec(body);
      if (!m) {
        warn(line, 'A change needs a table and a row id, as in + media m1.');
        continue;
      }
      const [, op, table, id, rest] = m;
      const values: DataValues = {};
      if (op === '-' && rest) warn(line, 'A deletion takes no values.');
      else if (rest) {
        for (const part of splitPipes(rest).map((p) => p.trim())) {
          if (!part) continue;
          const kv = VALUE.exec(part);
          if (kv) values[kv[1]] = parseValue(kv[2].trim());
          else warn(line, `"${part}" should be column: value.`);
        }
      }
      owner.changes.push({ op: op as DataChange['op'], table, id, values, line });
      continue;
    }

    // Anything else indented is explanation.
    if (paragraph) owner.doc[owner.doc.length - 1] += ' ' + body;
    else owner.doc.push(body);
    paragraph = true;
  }

  const names = new Set(tables.map((t) => t.name));
  for (const t of tables) {
    for (const c of t.columns) {
      if (c.ref !== undefined && !names.has(c.ref)) warn(t.line, `${t.name}.${c.name} points at ${c.ref}, which isn't declared.`);
    }
  }
  if (!tables.length) warn(header?.index === undefined ? 1 : header.index + 1, 'No tables are declared.');
  diagnostics.push(...checkData({ tables, steps }));
  diagnostics.sort((a, b) => a.line - b.line);

  return { view: 'data', source, tables, steps, diagnostics };
}

/** The columns between a declaration's parentheses. */
function columns(inside: string, table: string, line: number, warn: (line: number, message: string) => void): DataColumn[] {
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
