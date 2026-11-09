/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { evaluate } from '@mdx-js/mdx';
import type { Element, Root as HastRoot, RootContent } from 'hast';
import { createElement } from 'react';
import * as runtime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import rehypeStringify from 'rehype-stringify';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { describe, expect, test } from 'vitest';
import { parseTagsOnly } from '@skeudo/core';
import { srcBaseHref, tagHast, toHast } from '@skeudo/html';
import remarkSkeudo, { type Options } from '../src/index';

const FENCE = '```';
const fenced = (lang: string, body: string) => `${FENCE}${lang}\n${body}${FENCE}\n`;
const SKETCH = 'get_user(id):\n    row = find(id)    ::read:postgres.users\n';

const html = (source: string, options?: Options) =>
  String(unified().use(remarkParse).use(remarkSkeudo, options).use(remarkRehype).use(rehypeStringify).processSync(source));

function hast(source: string, options?: Options): HastRoot {
  const processor = unified().use(remarkParse).use(remarkSkeudo, options).use(remarkRehype);
  return processor.runSync(processor.parse(source)) as HastRoot;
}

/** The elements of a tree, depth first. */
function* elements(node: HastRoot | RootContent): Generator<Element> {
  if (node.type === 'element') yield node;
  if ('children' in node) for (const child of node.children) yield* elements(child);
}

const find = (tree: HastRoot, cls: string) => [...elements(tree)].filter((e) => (e.properties.className as string[] | undefined)?.includes(cls));

/** A tree without the source positions remark-rehype adds, to compare with the renderer's. */
const bare = (node: unknown): unknown => JSON.parse(JSON.stringify(node, (key, value) => (key === 'position' ? undefined : value)));

const fixturesDir = new URL('../../../spec/fixtures/code/', import.meta.url);
const fixtures = readdirSync(fixturesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .flatMap((d) =>
    readdirSync(new URL(`${d.name}/`, fixturesDir))
      .filter((f) => f.endsWith('.skeudo'))
      .map((f) => [`${d.name}/${f}`, readFileSync(new URL(`${d.name}/${f}`, fixturesDir), 'utf8')] as const),
  );

describe('sketch fences', () => {
  test('renders skeudo fences, and the sketch fences of documents written before the rename', () => {
    expect(html(fenced('skeudo', SKETCH))).toContain('<div class="sketch"');
    expect(html(fenced('sketch', SKETCH))).toContain('<div class="sketch"');
  });

  test('leaves other fences alone', () => {
    expect(html(fenced('python', 'print(1)\n'))).toBe('<pre><code class="language-python">print(1)\n</code></pre>');
  });

  test('renders only the languages it is given, when given some', () => {
    expect(html(fenced('sketch', SKETCH), { langs: ['skeudo'] })).not.toContain('class="sketch');
  });

  test('renders fences nested in lists and quotes', () => {
    const doc = `- step\n\n  ${fenced('skeudo', SKETCH).replaceAll('\n', '\n  ')}\n> ${fenced('skeudo', SKETCH).trimEnd().replaceAll('\n', '\n> ')}\n`;
    expect(find(hast(doc), 'sketch')).toHaveLength(2);
  });

  test.each(fixtures)('builds the same tree as the renderer: %s', (_name, source) => {
    const [sketch] = find(hast(fenced('skeudo', source)), 'sketch');
    expect(bare(sketch)).toEqual(bare(toHast(source)));
  });

  test('passes rendering options on', () => {
    const source = 'get_user(id):                 ::src[api/users.ts:12]\n    ::todo[cache it]\n';
    const out = html(fenced('skeudo', source), {
      srcHref: srcBaseHref('https://github.com/org/repo/blob/a1b2c3d/'),
      kindColors: { todo: '#8b5cf6' },
    });
    expect(out).toContain('href="https://github.com/org/repo/blob/a1b2c3d/api/users.ts#L12"');
    expect(out).toContain('style="--sk-c:#8b5cf6"');
  });

  test('links a sketch that names its repository there, with no options', () => {
    const source = 'get_user(id):                 ::src[api/users.ts:12]\n    ::repo[git+https://github.com/org/repo@a1b2c3d]\n';
    expect(html(fenced('skeudo', source))).toContain('href="https://github.com/org/repo/blob/a1b2c3d/api/users.ts#L12"');
  });

  test("reports the parser's warnings on the file, at their line in the document", () => {
    const doc = `# Doc\n\n${fenced('skeudo', 'f():\n    a     ::changed\n')}`;
    const file = unified().use(remarkParse).use(remarkSkeudo).use(remarkRehype).use(rehypeStringify).processSync(doc);
    expect(file.messages.map((m) => [m.line, m.source, m.reason])).toEqual([
      [5, 'remark-skeudo', '::changed needs a note saying how, as in ::changed[was …].'],
    ]);
  });
});

describe('inline tags', () => {
  test('renders inline code made only of tags as pills', () => {
    const [code] = find(hast('Reads `::read:postgres.users ::write?:redis`.'), 'sk-inline');
    const tags = parseTagsOnly('::read:postgres.users ::write?:redis')!;
    expect(code.tagName).toBe('code');
    expect(bare(code.children)).toEqual(bare([tagHast(tags[0]), { type: 'text', value: ' ' }, tagHast(tags[1])]));
  });

  test('leaves other inline code alone, and all inline code when inlineTags is false', () => {
    expect(html('Set `x = 1`.')).toBe('<p>Set <code>x = 1</code>.</p>');
    expect(html('Reads `::read:postgres`.', { inlineTags: false })).toBe('<p>Reads <code>::read:postgres</code>.</p>');
  });
});

describe('MDX', () => {
  test('renders sketches and inline tags in an MDX document', async () => {
    const doc = `# Users\n\nReads \`::read:postgres.users\`.\n\n${fenced('skeudo', SKETCH)}`;
    const { default: Content } = await evaluate(doc, { ...runtime, remarkPlugins: [remarkSkeudo] });
    const out = renderToStaticMarkup(createElement(Content));
    expect(out).toContain('<div class="sketch" style="--sk-indent:4ch" data-sketch="true">');
    expect(out).toContain('<div class="sk-row" style="--d:1" data-line="2">');
    expect(out).toContain('<code class="sk-inline"><span class="sk-tagw" title="::read:postgres.users">');
  });
});
