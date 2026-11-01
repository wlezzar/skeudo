/// <reference types="node" />
import { globSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, type Sketch, type SketchLine } from '@sketch/core';
import { OnigScanner, OnigString, loadWASM } from 'vscode-oniguruma';
import { INITIAL, Registry, type IGrammar, type IRawGrammar } from 'vscode-textmate';
import { beforeAll, describe, expect, test } from 'vitest';
import { markdownInjection, sketchGrammar } from '../src/grammar';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(import.meta.url);

// VS Code's tokenizer, with VS Code's Markdown grammar.
const GRAMMARS: Record<string, unknown> = {
  'source.sketch': sketchGrammar,
  'markdown.sketch.codeblock': markdownInjection,
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
    getInjections: (scope) => (scope === 'text.html.markdown' ? ['markdown.sketch.codeblock'] : undefined),
  });
  sketchTm = (await registry.loadGrammar('source.sketch'))!;
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

const FAMILIES = ['read', 'write', 'fail', 'danger', 'new', 'changed', 'removed', 'src'];
const family = (kind: string) => (kind === 'untrusted' || kind === 'secret' ? 'label' : FAMILIES.includes(kind) ? kind : 'other');

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
 * The parser's marks, adjusted where the grammar is expected to differ: as the header of src/grammar.ts
 * says, a line starting with a tracked variable keeps its first word. The other gap, a call alone on a first
 * line without a block, doesn't occur in these sketches.
 */
function allowedDifferences(sketch: Sketch, line: SketchLine, raw: string, marks: Marks): Marks {
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
  [...readFileSync(join(ROOT, doc), 'utf8').matchAll(/^```sketch\n([\s\S]*?)^```/gm)]
    .map((m) => m[1].replace(/\n$/, ''))
    .filter((b) => b.trim() !== '...')
    .map((source, i) => ({ name: `${doc} #${i + 1}`, source }));

const SKETCHES = [
  ...globSync('**/*.sketch', { cwd: join(ROOT, 'spec/fixtures') })
    .sort()
    .map((name) => ({ name, source: readFileSync(join(ROOT, 'spec/fixtures', name), 'utf8').replace(/\n$/, '') })),
  ...docSketches('spec/spec.md'),
  ...docSketches('skills/sketch/SKILL.md'),
];

describe('agrees with the parser', () => {
  test('on some sketches', () => {
    expect(SKETCHES.length).toBeGreaterThan(30);
  });

  for (const { name, source } of SKETCHES) {
    test(name, () => {
      const sketch = parse(source);
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
    ['::read:redis', 'support.type.read.sketch'],
    ['::write:redis', 'entity.name.write.sketch'],
    ['::fail:NotFound', 'invalid.fail.sketch'],
    ['::untrusted:body', 'variable.other.constant.untrusted.sketch'],
    ['::secret:token', 'variable.other.constant.secret.sketch'],
    ['::danger[shared]', 'markup.bold.danger.sketch'],
    ['::new', 'markup.inserted.new.sketch'],
    ['::changed[was x]', 'markup.changed.sketch'],
    ['::removed', 'markup.deleted.removed.sketch'],
    ['::src[app/a.py:3]', 'comment.src.sketch'],
    ['::todo[ask]', 'entity.name.label.todo.sketch'],
    ['::unsure[maybe]', 'entity.name.label.unsure.sketch'],
  ])('%s', (tag, scope) => {
    expect(sketchScopes(`x  ${tag}`, tag)).toContain(scope);
  });

  test('a write is orange in themes that color entity names, and like a string in those that do not', () => {
    expect(sketchScopes('x  ::write:redis', 'write')).toEqual(
      expect.arrayContaining(['meta.tag.write.sketch', 'string.other.write.sketch', 'entity.name.write.sketch']),
    );
  });

  test('a tag of a longer kind is not the shorter kind', () => {
    expect(sketchScopes('x  ::reader:redis', 'reader')).toContain('entity.name.label.reader.sketch');
  });

  test('notes are muted, unless they flag a danger', () => {
    const source = 'x  ::read:pg[lookup by key] ::write:stripe[!no key]';
    expect(sketchScopes(source, 'lookup')).toContain('comment.note.sketch');
    expect(sketchScopes(source, 'no key')).toEqual(expect.arrayContaining(['markup.bold.danger.sketch', 'constant.character.escape.danger.sketch']));
    expect(sketchScopes(source, '!no')).toContain('punctuation.definition.danger.sketch');
  });

  test('::src locations are underlined like links', () => {
    expect(sketchScopes('x  ::src:load[app/users.py:88]', 'app/')).toEqual(expect.arrayContaining(['comment.src.sketch', 'markup.underline.link.sketch']));
  });

  test('modifiers and the runtime system', () => {
    const source = 'run(call)  ::write?~:*';
    expect(sketchScopes(source, '?')).toEqual(expect.arrayContaining(['entity.name.write.sketch', 'storage.modifier.conditional.sketch']));
    expect(sketchScopes(source, '~')).toContain('storage.modifier.unverified.sketch');
    expect(sketchScopes(source, '*')).toEqual(expect.arrayContaining(['entity.name.write.sketch', 'constant.language.wildcard.sketch']));
  });

  test('the signature, its parameters, bindings, calls and first words', () => {
    const source = ['get_profile(mut user_id: int = 1):', '    cached = cache.get(user_id)', '    if cached:'].join('\n');
    expect(sketchScopes(source, 'get_profile')).toEqual(['source.sketch', 'meta.function.signature.sketch', 'entity.name.function.sketch']);
    expect(sketchScopes(source, 'mut')).toContain('storage.modifier.sketch');
    expect(sketchScopes(source, 'user_id:')).toContain('variable.parameter.sketch');
    expect(sketchScopes(source, 'int')).not.toContain('variable.parameter.sketch');
    expect(sketchScopes(source, 'cached =')).toContain('entity.name.variable.sketch');
    expect(sketchScopes(source, 'cache.get')).toEqual(expect.arrayContaining(['meta.function-call.sketch', 'entity.name.function.sketch']));
    expect(sketchScopes(source, '.get')).toContain('punctuation.accessor.sketch');
    expect(sketchScopes(source, 'if')).toContain('keyword.control.first-word.sketch');
  });

  test('finds the signature on the first line only', () => {
    const source = ['first, a prose line', 'cache.set(key):', '    then this'].join('\n');
    expect(sketchScopes(source, 'cache.set')).toContain('meta.function-call.sketch');
    expect(sketchScopes(source, 'cache.set')).not.toContain('meta.function.signature.sketch');
    expect(sketchScopes(source, 'key')).not.toContain('variable.parameter.sketch');
  });

  test('finds the signature of a sketch indented as a whole, after blank lines', () => {
    const source = ['', '    charge(card, amount):', '        stripe.charges.create(card, amount)'].join('\n');
    expect(sketchScopes(source, 'charge')).toContain('meta.function.signature.sketch');
    expect(sketchScopes(source, 'amount)')).toContain('variable.parameter.sketch');
  });

  test('takes the first word of a sketch indented as a whole', () => {
    expect(sketchScopes('    When a webhook arrives:', 'When')).toContain('keyword.control.first-word.sketch');
  });
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
    const grammar = (await registry.loadGrammar('source.sketch'))!;
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
    const theme = { string: '#ce9178', 'entity.name': '#ffa657', comment: '#6a9955', 'entity.name.write.sketch': '#c2410c' };
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
    '```sketch', // 5
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
    '  ~~~~sketch title="refresh"',
    '  refresh(token):',
    '      ::write:oauth',
    '  ~~~~',
    '', // 20
    '````text',
    '```sketch',
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
    expect(at(5, 'sketch')).toContain('fenced_code.block.language.markdown');
    expect(at(6, 'get_profile')).toEqual([
      'text.html.markdown',
      'markup.fenced_code.block.markdown',
      'meta.embedded.block.sketch',
      'meta.function.signature.sketch',
      'entity.name.function.sketch',
    ]);
    expect(at(7, '::read')).toContain('support.type.read.sketch');
  });

  test('ends the sketch at the closing fence', () => {
    expect(at(8, '```')).toEqual(['text.html.markdown', 'markup.fenced_code.block.markdown', 'punctuation.definition.markdown']);
    expect(at(31, 'x = y').join(' ')).not.toContain('sketch');
  });

  test('leaves other fences and inline code alone', () => {
    expect(at(3, '::read').join(' ')).not.toContain('sketch');
    expect(at(11, '::read').join(' ')).not.toContain('sketch');
  });

  test('embeds an indented tilde fence with attributes, in a list item', () => {
    expect(at(16, 'title')).toContain('fenced_code.block.language.attributes.markdown');
    expect(at(17, 'refresh')).toContain('meta.function.signature.sketch');
    expect(at(18, '::write')).toContain('entity.name.write.sketch');
    expect(at(19, '~~~~')).toContain('punctuation.definition.markdown');
  });

  test('leaves a sketch fence inside another code block alone', () => {
    expect(at(23, 'not').join(' ')).not.toContain('sketch');
  });

  test('finds the signature on the first line of each fence only', () => {
    expect(at(28, 'a')).toContain('keyword.control.first-word.sketch');
    expect(at(29, 'b(')).toContain('meta.function-call.sketch');
    expect(at(29, 'b(')).not.toContain('meta.function.signature.sketch');
  });
});
