/// <reference types="node" />
import { globSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCode, parseData, type CodeSketch, type SketchLine } from '@skeudo/core';
import { FENCE_LANGS } from 'markdown-it-skeudo';
import { OnigScanner, OnigString, loadWASM } from 'vscode-oniguruma';
import { INITIAL, Registry, type IGrammar, type IRawGrammar } from 'vscode-textmate';
import { beforeAll, describe, expect, test } from 'vitest';
import { markdownInjection, sketchGrammar } from '../src/grammars';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(import.meta.url);

// VS Code's tokenizer, with VS Code's Markdown grammar.
const GRAMMARS: Record<string, unknown> = {
  'source.skeudo': sketchGrammar,
  'markdown.skeudo.codeblock': markdownInjection,
  'text.html.markdown': JSON.parse(readFileSync(new URL('grammars/markdown.tmLanguage.json', import.meta.url), 'utf8')),
};
const onigLib = Promise.resolve({ createOnigScanner: (p: string[]) => new OnigScanner(p), createOnigString: (s: string) => new OnigString(s) });
// vscode-textmate writes rule ids into the grammars it loads, so it gets copies.
const loadGrammar = async (scope: string) => (scope in GRAMMARS ? (structuredClone(GRAMMARS[scope]) as IRawGrammar) : null);
let sketchTm: IGrammar;
let markdownTm: IGrammar;

beforeAll(async () => {
  await loadWASM(readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm')));
  const registry = new Registry({
    onigLib,
    loadGrammar,
    getInjections: (scope) => (scope === 'text.html.markdown' ? ['markdown.skeudo.codeblock'] : undefined),
  });
  sketchTm = (await registry.loadGrammar('source.skeudo'))!;
  markdownTm = (await registry.loadGrammar('text.html.markdown'))!;
});

interface Token {
  text: string;
  start: number;
  end: number;
  scopes: string[];
}

function tokenize(grammar: IGrammar, source: string): Token[][] {
  let state = INITIAL;
  return source.split('\n').map((line) => {
    const { tokens, ruleStack } = grammar.tokenizeLine(line, state);
    state = ruleStack;
    return tokens.map((t) => ({ text: line.slice(t.startIndex, t.endIndex), start: t.startIndex, end: t.endIndex, scopes: t.scopes }));
  });
}

/** The scopes of the token under the first character of `text`, on the first line that contains it. */
function scopesAt(lines: Token[][], source: string, text: string): string[] {
  const row = source.split('\n').findIndex((l) => l.includes(text));
  const col = source.split('\n')[row]?.indexOf(text);
  const token = lines[row]?.find((t) => t.start <= col && col < t.end);
  if (!token) throw new Error(`no token at "${text}"`);
  return token.scopes;
}

const sketchScopes = (source: string, text: string) => scopesAt(tokenize(sketchTm, source), source, text);
const has = (scopes: string[], scope: string) => scopes.some((s) => s === scope || s.startsWith(`${scope}.`));

// --- Agreement with the parser -----------------------------------------------------------------------------

/** What the parser or the grammar marks on a line, as `start-end text` strings at offsets in the raw line. */
interface Marks {
  tags: string[];
  fns: string[];
  words: string[];
  bindings: string[];
  dangers: string[];
}

const FAMILIES = ['read', 'write', 'fail', 'danger', 'new', 'changed', 'removed', 'src', 'doc'];
const family = (kind: string) =>
  kind === 'untrusted' || kind === 'secret' ? 'label' : kind === 'repo' ? 'src' : FAMILIES.includes(kind) ? kind : 'other';

function parserMarks(line: SketchLine, raw: string): Marks {
  const lead = raw.length - raw.trimStart().length;
  const mark = (start: number, text: string, label = text) => `${lead + start}-${lead + start + text.length} ${label}`;
  const marks: Marks = { tags: [], fns: [], words: [], bindings: [], dangers: [] };
  for (const t of line.tags) {
    marks.tags.push(mark(t.start, t.raw, `${family(t.kind)} ${t.raw}`));
    if (t.kind === 'danger' || t.note?.danger) marks.dangers.push(mark(t.start, t.raw));
  }
  // Segments carry no offsets, but they spell out the line in order.
  let at = 0;
  for (const s of line.segments) {
    const text = s.type === 'tag' ? s.tag.raw : s.text;
    expect(line.text.startsWith(text, at), `segments spell out line ${line.number}`).toBe(true);
    if (s.type === 'call' || s.type === 'fn') marks.fns.push(mark(at, text));
    if (s.type === 'word') marks.words.push(mark(at, text));
    at += text.length;
  }
  if (line.binding) marks.bindings.push(mark(0, line.binding));
  return marks;
}

function grammarMarks(tokens: Token[]): Marks {
  /** Neighboring tokens that `key` gives the same key. Two tags can't touch, since a tag follows whitespace. */
  const runs = (key: (t: Token) => string | undefined) => {
    const out: { start: number; end: number; key: string; text: string }[] = [];
    for (const t of tokens) {
      const k = key(t);
      const last = out[out.length - 1];
      if (k === undefined) continue;
      if (last && last.end === t.start && last.key === k) Object.assign(last, { end: t.end, text: last.text + t.text });
      else out.push({ start: t.start, end: t.end, key: k, text: t.text });
    }
    return out;
  };
  const scoped = (scope: string) => (t: Token) => (has(t.scopes, scope) ? '' : undefined);
  const format = (r: { start: number; end: number; text: string }, label = r.text) => `${r.start}-${r.end} ${label}`;
  const tags = runs((t) => t.scopes.find((s) => s.startsWith('meta.tag.'))?.split('.')[2]);
  // A danger is marked on its note, or on the whole of a ::danger tag.
  const danger = runs(scoped('constant.character.escape.danger'));
  return {
    tags: tags.map((r) => format(r, `${r.key} ${r.text}`)),
    fns: runs(scoped('entity.name.function')).map((r) => format(r)),
    words: runs(scoped('keyword.control.first-word')).map((r) => format(r)),
    bindings: runs(scoped('entity.name.variable')).map((r) => format(r)),
    dangers: tags.filter((tag) => danger.some((d) => tag.start <= d.start && d.end <= tag.end)).map((r) => format(r)),
  };
}

/**
 * The parser's marks, adjusted where the grammar is expected to differ: as the header of src/grammars/code.ts
 * says, a line starting with a tracked variable keeps its first word. The other gap, a call alone on a first
 * line without a block, doesn't occur in these sketches.
 */
function allowedDifferences(sketch: CodeSketch, line: SketchLine, raw: string, marks: Marks): Marks {
  const expected = structuredClone(marks);
  const lead = raw.length - raw.trimStart().length;
  const ident = /^[\p{L}_][\p{L}\p{N}_]*/u.exec(line.text)?.[0];
  const word = /^[\p{L}](?:[\p{L}\p{N}_'’-])*/u.exec(line.text)?.[0];
  const codeLike = word !== undefined && /^(?:\(|\.|::)/.test(line.text.slice(word.length));
  if (!marks.words.length && !line.binding && ident && word && !codeLike && ident in sketch.variables) {
    expected.words.push(`${lead}-${lead + word.length} ${word}`);
  }
  return expected;
}

const docSketches = (doc: string) =>
  [...readFileSync(join(ROOT, doc), 'utf8').matchAll(/^```skeudo\n([\s\S]*?)^```/gm)]
    .map((m) => m[1].replace(/\n$/, ''))
    .map((source, i) => ({ name: `${doc} #${i + 1}`, source }));

const SKETCHES = [
  ...globSync('**/*.skeudo', { cwd: join(ROOT, 'spec/fixtures/code') })
    .sort()
    .map((name) => ({ name, source: readFileSync(join(ROOT, 'spec/fixtures/code', name), 'utf8').replace(/\n$/, '') })),
  ...docSketches('spec/code.md'),
  ...docSketches('skills/skeudo/SKILL.md'),
];

describe('agrees with the parser', () => {
  test('on some sketches', () => {
    expect(SKETCHES.length).toBeGreaterThan(30);
  });

  for (const { name, source } of SKETCHES) {
    test(name, () => {
      const sketch = parseCode(source);
      const tokens = tokenize(sketchTm, source);
      const raws = source.split('\n');
      for (const line of sketch.lines) {
        if (line.blank) continue;
        const raw = raws[line.number - 1];
        const expected = allowedDifferences(sketch, line, raw, parserMarks(line, raw));
        expect({ line: line.number, ...grammarMarks(tokens[line.number - 1]) }).toEqual({ line: line.number, ...expected });
      }

      const params = new Set(tokens.flat().filter((t) => has(t.scopes, 'variable.parameter')).map((t) => t.text));
      expect([...params]).toEqual(sketch.signature?.params ?? []);
    });
  }
});

// --- Scopes ------------------------------------------------------------------------------------------------

describe('scopes', () => {
  test.each([
    ['::read:redis', 'support.type.read.skeudo'],
    ['::write:redis', 'entity.name.write.skeudo'],
    ['::fail:NotFound', 'invalid.fail.skeudo'],
    ['::untrusted:body', 'variable.other.constant.untrusted.skeudo'],
    ['::secret:token', 'variable.other.constant.secret.skeudo'],
    ['::danger[shared]', 'markup.bold.danger.skeudo'],
    ['::new', 'markup.inserted.new.skeudo'],
    ['::changed[was x]', 'markup.changed.skeudo'],
    ['::removed', 'markup.deleted.removed.skeudo'],
    ['::src[app/a.py:3]', 'comment.src.skeudo'],
    ['::doc[what it does]', 'comment.doc.skeudo'],
    ['::doc:load[what it does]', 'comment.doc.skeudo'],
    ['::todo[ask]', 'entity.name.label.todo.skeudo'],
    ['::unsure[maybe]', 'entity.name.label.unsure.skeudo'],
  ])('%s', (tag, scope) => {
    expect(sketchScopes(`x  ${tag}`, tag)).toContain(scope);
  });

  test('a write is orange in themes that color entity names, and like a string in those that do not', () => {
    expect(sketchScopes('x  ::write:redis', 'write')).toEqual(
      expect.arrayContaining(['meta.tag.write.skeudo', 'string.other.write.skeudo', 'entity.name.write.skeudo']),
    );
  });

  test('a tag of a longer kind is not the shorter kind', () => {
    expect(sketchScopes('x  ::reader:redis', 'reader')).toContain('entity.name.label.reader.skeudo');
  });

  test('notes are muted, unless they flag a danger', () => {
    const source = 'x  ::read:pg[lookup by key] ::write:stripe[!no key]';
    expect(sketchScopes(source, 'lookup')).toContain('comment.note.skeudo');
    expect(sketchScopes(source, 'no key')).toEqual(expect.arrayContaining(['markup.bold.danger.skeudo', 'constant.character.escape.danger.skeudo']));
    expect(sketchScopes(source, '!no')).toContain('punctuation.definition.danger.skeudo');
  });

  test('::src locations are underlined like links', () => {
    expect(sketchScopes('x  ::src:load[app/users.py:88]', 'app/')).toEqual(expect.arrayContaining(['comment.src.skeudo', 'markup.underline.link.skeudo']));
  });

  test('::repo is muted like ::src, with its URL underlined', () => {
    const source = '    ::repo[git+https://github.com/org/shop@a1b2c3d]';
    expect(sketchScopes(source, '::repo')).toEqual(expect.arrayContaining(['meta.tag.src.skeudo', 'comment.src.skeudo']));
    expect(sketchScopes(source, 'git+')).toEqual(expect.arrayContaining(['comment.src.skeudo', 'markup.underline.link.skeudo']));
  });

  test('modifiers and the runtime system', () => {
    const source = 'run(call)  ::write?~:*';
    expect(sketchScopes(source, '?')).toEqual(expect.arrayContaining(['entity.name.write.skeudo', 'storage.modifier.conditional.skeudo']));
    expect(sketchScopes(source, '~')).toContain('storage.modifier.unverified.skeudo');
    expect(sketchScopes(source, '*')).toEqual(expect.arrayContaining(['entity.name.write.skeudo', 'constant.language.wildcard.skeudo']));
  });

  test('the signature, its parameters, bindings, calls and first words', () => {
    const source = ['get_profile(mut user_id: int = 1):', '    cached = cache.get(user_id)', '    if cached:'].join('\n');
    expect(sketchScopes(source, 'get_profile')).toEqual(['source.skeudo', 'meta.function.signature.skeudo', 'entity.name.function.skeudo']);
    expect(sketchScopes(source, 'mut')).toContain('storage.modifier.skeudo');
    expect(sketchScopes(source, 'user_id:')).toContain('variable.parameter.skeudo');
    expect(sketchScopes(source, 'int')).not.toContain('variable.parameter.skeudo');
    expect(sketchScopes(source, 'cached =')).toContain('entity.name.variable.skeudo');
    expect(sketchScopes(source, 'cache.get')).toEqual(expect.arrayContaining(['meta.function-call.skeudo', 'entity.name.function.skeudo']));
    expect(sketchScopes(source, '.get')).toContain('punctuation.accessor.skeudo');
    expect(sketchScopes(source, 'if')).toContain('keyword.control.first-word.skeudo');
  });

  test('finds the signature on the first line only', () => {
    const source = ['first, a prose line', 'cache.set(key):', '    then this'].join('\n');
    expect(sketchScopes(source, 'cache.set')).toContain('meta.function-call.skeudo');
    expect(sketchScopes(source, 'cache.set')).not.toContain('meta.function.signature.skeudo');
    expect(sketchScopes(source, 'key')).not.toContain('variable.parameter.skeudo');
  });

  test('finds the signature of a sketch indented as a whole, after blank lines', () => {
    const source = ['', '    charge(card, amount):', '        stripe.charges.create(card, amount)'].join('\n');
    expect(sketchScopes(source, 'charge')).toContain('meta.function.signature.skeudo');
    expect(sketchScopes(source, 'amount)')).toContain('variable.parameter.skeudo');
  });

  test('takes the first word of a sketch indented as a whole', () => {
    expect(sketchScopes('    When a webhook arrives:', 'When')).toContain('keyword.control.first-word.skeudo');
  });
});

// --- The data view -----------------------------------------------------------------------------------------

describe('the data view', () => {
  const SOURCE = [
    'view: data', // 1
    'table order(customer -> customer, state, total)',
    '  What the customer buys.',
    'table customer(',
    '  name,', // 5
    '  email → address,',
    ')',
    '',
    'Ana checks out (as a guest)',
    '  + customer c1  name: Ana | email: null', // 10
    '  ~ order o1     state: "paid | done" | total: 10:14',
    '  - order o1',
    '  Explained after the changes.',
    'Login(Google) fails',
    '[Billing / S3]', // 15
    '  Explains the group.',
    'folder invoices(order -> order)',
    '', // 18
    'She checks out again',
    '  > Checkout finds her by email', // 20
    '    ? customer  email: ana@example.com',
    '  > It lists her files',
    '    ? invoices  ana/',
    '    ? order o1',
    '    + order o2  customer: c1', // 25
  ].join('\n');
  let lines: Token[][];
  beforeAll(() => {
    lines = tokenize(sketchTm, SOURCE);
  });
  const at = (line: number, text: string) => {
    const col = SOURCE.split('\n')[line - 1].indexOf(text);
    return lines[line - 1].find((t) => t.start <= col && col < t.end)!.scopes;
  };

  test('starts with a header that names the view', () => {
    expect(at(1, 'view: data')).toEqual(['source.skeudo', 'keyword.control.view.skeudo']);
  });

  test('declarations start with their kind, and name a table, its columns and the tables they point at', () => {
    expect(at(2, 'table')).toContain('storage.type.kind.skeudo');
    expect(at(17, 'folder')).toContain('storage.type.kind.skeudo');
    expect(at(17, 'invoices')).toContain('entity.name.type.table.skeudo');
    expect(at(2, 'order')).toContain('entity.name.type.table.skeudo');
    expect(at(2, 'customer ->')).toContain('variable.other.property.column.skeudo');
    expect(at(2, '->')).toContain('keyword.operator.reference.skeudo');
    expect(at(2, 'customer,')).toContain('entity.name.type.table.skeudo');
    expect(at(2, 'state')).toContain('variable.other.property.column.skeudo');
  });

  test('a declaration may run over several lines', () => {
    expect(at(5, 'name')).toEqual(expect.arrayContaining(['meta.declaration.table.skeudo', 'variable.other.property.column.skeudo']));
    expect(at(6, '→')).toContain('keyword.operator.reference.skeudo');
    expect(at(7, ')')).toContain('punctuation.definition.columns.end.skeudo');
  });

  test('a group line names its group, and the lines under it explain it', () => {
    expect(at(15, '[')).toContain('punctuation.definition.group.begin.skeudo');
    expect(at(15, 'Billing')).toEqual(expect.arrayContaining(['meta.group.skeudo', 'entity.name.namespace.group.skeudo']));
    expect(at(15, 'S3')).toContain('entity.name.namespace.group.skeudo');
    expect(at(15, ']')).toContain('punctuation.definition.group.end.skeudo');
    expect(at(16, 'Explains')).toContain('comment.block.documentation.explanation.skeudo');
  });

  test('other lines that are not indented are step titles, and other indented lines are explanations', () => {
    expect(at(9, 'Ana')).toContain('markup.heading.step.skeudo');
    expect(at(14, 'Login')).toContain('markup.heading.step.skeudo');
    expect(at(14, 'Google')).toContain('markup.heading.step.skeudo');
    expect(at(3, 'What')).toContain('comment.block.documentation.explanation.skeudo');
    expect(at(13, 'Explained')).toContain('comment.block.documentation.explanation.skeudo');
  });

  test('changes name their kind, table, row, columns and values', () => {
    expect(at(10, '+')).toContain('markup.inserted.skeudo');
    expect(at(11, '~')).toContain('markup.changed.skeudo');
    expect(at(12, '-')).toContain('markup.deleted.skeudo');
    expect(at(10, 'customer')).toContain('entity.name.type.table.skeudo');
    expect(at(10, 'c1')).toContain('variable.other.constant.id.skeudo');
    expect(at(10, 'name')).toContain('variable.other.property.column.skeudo');
    expect(at(10, 'Ana')).toContain('string.unquoted.value.skeudo');
    expect(at(10, 'email')).toContain('variable.other.property.column.skeudo');
    expect(at(10, 'null')).toContain('constant.language.null.skeudo');
    expect(at(11, '"paid')).toContain('string.quoted.double.skeudo');
    expect(at(11, 'done"')).toContain('string.quoted.double.skeudo');
    expect(at(11, 'total')).toContain('variable.other.property.column.skeudo');
    // A value is split from its column at the first colon only.
    expect(at(11, '14')).toContain('string.unquoted.value.skeudo');
  });

  test('a substep is a heading, and a read names its table and what it finds', () => {
    expect(at(20, '>')).toContain('punctuation.definition.heading.substep.skeudo');
    expect(at(20, 'Checkout')).toEqual(expect.arrayContaining(['meta.substep.skeudo', 'markup.heading.substep.skeudo']));
    expect(at(21, '?')).toEqual(expect.arrayContaining(['meta.read.skeudo', 'support.type.read.skeudo']));
    expect(at(21, 'customer')).toContain('entity.name.type.table.skeudo');
    expect(at(21, 'email')).toContain('variable.other.property.column.skeudo');
    expect(at(21, 'ana@')).toContain('string.unquoted.value.skeudo');
    expect(at(23, 'invoices')).toContain('entity.name.type.table.skeudo');
    expect(at(23, 'ana/')).toContain('variable.other.constant.id.skeudo');
    expect(at(24, 'o1')).toContain('variable.other.constant.id.skeudo');
    expect(at(25, '+')).toContain('markup.inserted.skeudo');
  });

  test('a later line reading view: data is a line of code', () => {
    expect(sketchScopes('view: code\nx = 1\nview: data', 'view: data')).not.toContain('keyword.control.view.skeudo');
  });

  test('a code header keeps the signature on the line after it', () => {
    const source = ['view: code', '', 'charge(card):', '    stripe.charge(card)'].join('\n');
    expect(sketchScopes(source, 'view: code')).toContain('keyword.control.view.skeudo');
    expect(sketchScopes(source, 'charge(')).toContain('meta.function.signature.skeudo');
    expect(sketchScopes(source, 'card)')).toContain('variable.parameter.skeudo');
  });

  test('a first line naming no view is a line of code, as in the parser', () => {
    expect(sketchScopes('view: dat\ntable media(role)', 'view')).not.toContain('keyword.control.view.skeudo');
  });

  test('a first line with more than a name after view: is not a header', () => {
    expect(sketchScopes('view: data flows\n  read the rows', 'view')).not.toContain('keyword.control.view.skeudo');
  });

  test('in a Markdown fence', () => {
    const doc = ['```skeudo', 'view: data', 'table media(role)', '', 'Upload', '  + media m1  role: x', '```', 'After.'].join('\n');
    const tokens = tokenize(markdownTm, doc);
    const first = (line: number) => tokens[line - 1].find((t) => t.text.trim())!.scopes;
    expect(first(2)).toContain('keyword.control.view.skeudo');
    expect(first(3)).toContain('storage.type.kind.skeudo');
    expect(first(5)).toContain('markup.heading.step.skeudo');
    expect(tokens[5].map((t) => t.scopes).flat()).toContain('markup.inserted.skeudo');
    expect(first(7)).toContain('punctuation.definition.markdown');
    expect(first(8).join(' ')).not.toContain('skeudo');
  });
});

/** What each line of a data sketch is, to the parser: the header, a group, a declaration, a step, a substep, a change, a read, or an explanation. */
function dataKinds(source: string): string[] {
  const sketch = parseData(source);
  const raws = source.split('\n');
  const kinds: string[] = raws.map((raw) => (raw.trim() ? 'explanation' : ''));
  kinds[raws.findIndex((raw) => raw.trim())] = 'header';
  for (const t of sketch.tables) {
    // A declaration runs on to the line with its closing parenthesis.
    let i = t.line - 1;
    kinds[i] = 'table';
    while (!raws[i].includes(')') && raws[i + 1]?.trim()) kinds[++i] = 'table';
  }
  for (const g of sketch.groups) kinds[g.line - 1] = 'group';
  for (const s of sketch.steps) {
    kinds[s.line - 1] = 'step';
    for (const part of [s, ...s.substeps]) {
      for (const c of part.changes) kinds[c.line - 1] = 'change';
      for (const r of part.reads) kinds[r.line - 1] = 'read';
    }
    for (const sub of s.substeps) kinds[sub.line - 1] = 'substep';
  }
  return kinds;
}

/** The same, to the grammar, from the scopes of each line's first token. */
function grammarKinds(source: string): string[] {
  return tokenize(sketchTm, source).map((tokens) => {
    const scopes = tokens.find((t) => t.text.trim())?.scopes ?? [];
    if (has(scopes, 'keyword.control.view')) return 'header';
    if (has(scopes, 'meta.group')) return 'group';
    if (has(scopes, 'meta.declaration.table')) return 'table';
    if (has(scopes, 'meta.change')) return 'change';
    if (has(scopes, 'meta.read')) return 'read';
    if (has(scopes, 'meta.substep')) return 'substep';
    if (has(scopes, 'markup.heading.step')) return 'step';
    if (has(scopes, 'comment.block.documentation.explanation')) return 'explanation';
    return scopes.length ? scopes.join(' ') : '';
  });
}

describe('the data view agrees with the parser', () => {
  const dir = join(ROOT, 'spec/fixtures/data');
  const sketches = [
    ...globSync('**/*.skeudo', { cwd: dir })
      .sort()
      .map((name) => ({ name, source: readFileSync(join(dir, name), 'utf8').replace(/\n$/, '') })),
    ...docSketches('spec/data.md'),
    ...docSketches('spec/spec.md'),
  ].filter(({ source }) => !parseData(source).diagnostics.length);

  test('on some sketches', () => {
    expect(sketches.length).toBeGreaterThan(5);
  });

  for (const { name, source } of sketches) {
    test(name, () => {
      expect(grammarKinds(source)).toEqual(dataKinds(source));
    });
  }
});

describe('in a theme', () => {
  /** The foreground color of each token on a one-line sketch, in a theme made of `rules`. */
  async function colors(source: string, rules: Record<string, string>) {
    const registry = new Registry({
      onigLib,
      loadGrammar,
      theme: {
        settings: [
          { settings: { foreground: '#000000', background: '#ffffff' } },
          ...Object.entries(rules).map(([scope, foreground]) => ({ scope, settings: { foreground } })),
        ],
      },
    });
    const grammar = (await registry.loadGrammar('source.skeudo'))!;
    const { tokens } = grammar.tokenizeLine2(source, INITIAL);
    const colorMap = registry.getColorMap();
    const out: Record<string, string> = {};
    for (let i = 0; i < tokens.length; i += 2) {
      const text = source.slice(tokens[i], tokens[i + 2] ?? source.length).trim();
      if (text) out[text] = colorMap[(tokens[i + 1] >>> 15) & 0x1ff].toLowerCase();
    }
    return out;
  }

  test('a write takes the entity name color, or the string color in themes without one', async () => {
    const source = 'x  ::write:redis[5 min ttl]';
    expect(await colors(source, { string: '#ce9178', 'entity.name': '#ffa657', comment: '#6a9955' })).toEqual({
      x: '#000000',
      '::write:redis': '#ffa657',
      '[5 min ttl]': '#6a9955',
    });
    expect(await colors(source, { string: '#ce9178', 'entity.name.function': '#dcdcaa' })).toMatchObject({ '::write:redis': '#ce9178' });
  });

  test('a rule for the scope the README gives recolors the head of a tag, not its note', async () => {
    const theme = { string: '#ce9178', 'entity.name': '#ffa657', comment: '#6a9955', 'entity.name.write.skeudo': '#c2410c' };
    expect(await colors('x  ::write?:redis[5 min ttl]', theme)).toEqual({ x: '#000000', '::write?:redis': '#c2410c', '[5 min ttl]': '#6a9955' });
  });
});

// --- Markdown ----------------------------------------------------------------------------------------------

describe('in Markdown', () => {
  const DOC = [
    '# Profile', // 1
    '',
    'Reads `::read:redis` first.',
    '',
    '```skeudo', // 5
    'get_profile(user_id):                    ::src[app/profile.py:12-24]',
    '    cached = cache.get(user_id)          ::read:redis',
    '```',
    '',
    '```python', // 10
    'cache.get(user_id)  ::read:redis',
    '```',
    '',
    '- a list item:',
    '', // 15
    '  ~~~~skeudo title="refresh"',
    '  refresh(token):',
    '      ::write:oauth',
    '  ~~~~',
    '', // 20
    '````text',
    '```skeudo',
    'not(a): sketch',
    '```',
    '````', // 25
    '',
    '```sketch',
    'a prose line',
    'b(c):',
    '```', // 30
    'After the fence, `x = y` is Markdown.',
  ].join('\n');

  let lines: Token[][];
  beforeAll(() => {
    lines = tokenize(markdownTm, DOC);
  });
  const at = (line: number, text: string) => {
    const col = DOC.split('\n')[line - 1].indexOf(text);
    return lines[line - 1].find((t) => t.start <= col && col < t.end)!.scopes;
  };

  test('embeds a sketch in a sketch fence', () => {
    expect(at(5, '```')).toEqual(['text.html.markdown', 'markup.fenced_code.block.markdown', 'punctuation.definition.markdown']);
    expect(at(5, 'skeudo')).toContain('fenced_code.block.language.markdown');
    expect(at(6, 'get_profile')).toEqual([
      'text.html.markdown',
      'markup.fenced_code.block.markdown',
      'meta.embedded.block.skeudo',
      'meta.function.signature.skeudo',
      'entity.name.function.skeudo',
    ]);
    expect(at(7, '::read')).toContain('support.type.read.skeudo');
  });

  test('embeds the sketch fences of documents written before the rename', () => {
    expect(at(27, 'sketch')).toContain('fenced_code.block.language.markdown');
    expect(at(28, 'a prose line')).toContain('meta.embedded.block.skeudo');
  });

  test('embeds every fence language the markdown-it plugin renders', () => {
    for (const lang of FENCE_LANGS) {
      const [fence, code] = tokenize(markdownTm, `\`\`\`${lang}\nf(x):\n\`\`\`\n`);
      expect(fence.find((t) => t.text === lang)?.scopes).toContain('fenced_code.block.language.markdown');
      expect(code.flatMap((t) => t.scopes)).toContain('meta.embedded.block.skeudo');
    }
  });

  test('ends the sketch at the closing fence', () => {
    expect(at(8, '```')).toEqual(['text.html.markdown', 'markup.fenced_code.block.markdown', 'punctuation.definition.markdown']);
    expect(at(31, 'x = y').join(' ')).not.toContain('skeudo');
  });

  test('leaves other fences and inline code alone', () => {
    expect(at(3, '::read').join(' ')).not.toContain('skeudo');
    expect(at(11, '::read').join(' ')).not.toContain('skeudo');
  });

  test('embeds an indented tilde fence with attributes, in a list item', () => {
    expect(at(16, 'title')).toContain('fenced_code.block.language.attributes.markdown');
    expect(at(17, 'refresh')).toContain('meta.function.signature.skeudo');
    expect(at(18, '::write')).toContain('entity.name.write.skeudo');
    expect(at(19, '~~~~')).toContain('punctuation.definition.markdown');
  });

  test('leaves a sketch fence inside another code block alone', () => {
    expect(at(23, 'not').join(' ')).not.toContain('skeudo');
  });

  test('finds the signature on the first line of each fence only', () => {
    expect(at(28, 'a')).toContain('keyword.control.first-word.skeudo');
    expect(at(29, 'b(')).toContain('meta.function-call.skeudo');
    expect(at(29, 'b(')).not.toContain('meta.function.signature.skeudo');
  });
});
