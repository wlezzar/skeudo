import type { ElementContent, Properties } from 'hast';
import type { Code, Data, InlineCode, Literal, Parent, Root } from 'mdast';
import { FENCE_LANGS, parse, parseTagsOnly } from '@skeudo/core';
import { tagHast, toHast, type HtmlOptions } from '@skeudo/html';

export { FENCE_LANGS };

export interface Options extends HtmlOptions {
  /** Fence languages rendered as sketches. Defaults to FENCE_LANGS. */
  langs?: readonly string[];
  /** Render inline code made only of tags, such as `::read:postgres`, as pills. Defaults to true. */
  inlineTags?: boolean;
}

/**
 * A rendered sketch, which replaces its ```skeudo fence in the tree. It keeps the fence's source as
 * `value`, and carries the rendered `div.sketch` in `data`, which remark-rehype turns into that element.
 */
export interface Skeudo extends Literal {
  type: 'skeudo';
  /** The fence language, such as `skeudo`. */
  lang: string;
  /** The rest of the fence's info string. */
  meta?: string | null;
  data: SkeudoData;
}

export interface SkeudoData extends Data {
  hName: 'div';
  hProperties: Properties;
  hChildren: ElementContent[];
}

declare module 'mdast' {
  interface BlockContentMap {
    skeudo: Skeudo;
  }
  interface RootContentMap {
    skeudo: Skeudo;
  }
}

/** The part of a vfile the plugin uses: parser warnings become messages on the file. */
interface MessageSink {
  message(reason: string, options?: { place?: { line: number; column: number }; source?: string; ruleId?: string }): unknown;
}

/**
 * remark plugin: renders ```skeudo fences (and ```sketch) as sketches, and inline code made only of
 * tags as pills. The output is a hast tree, so it works with remark-rehype, MDX, and the site
 * generators built on them, with no raw HTML. Parser warnings are reported as messages on the file.
 */
export default function remarkSkeudo(options: Options = {}) {
  const langs = new Set(options.langs ?? FENCE_LANGS);
  const inlineTags = options.inlineTags !== false;

  function sketch(code: Code, file: MessageSink | undefined): Skeudo {
    const parsed = parse(code.value, options);
    const start = code.position?.start;
    for (const d of parsed.diagnostics) {
      // The sketch's first line is the one after the opening fence.
      const place = start && { line: start.line + d.line, column: start.column };
      file?.message(d.message, { place, source: 'remark-skeudo', ruleId: 'parse' });
    }
    const { properties, children } = toHast(parsed, options);
    return {
      type: 'skeudo',
      lang: code.lang!,
      meta: code.meta,
      value: code.value,
      position: code.position,
      data: { hName: 'div', hProperties: properties, hChildren: children },
    };
  }

  function tags(code: InlineCode): void {
    const parsed = parseTagsOnly(code.value);
    if (!parsed) return;
    const children = parsed.flatMap((tag, i): ElementContent[] => [
      ...(i ? [{ type: 'text' as const, value: ' ' }] : []),
      tagHast(tag, options),
    ]);
    // remark-rehype applies these to the element it makes for inline code. It becomes a span, since site
    // generators such as Docusaurus render every `code` element through their code block component.
    const data = code.data as (Data & { hProperties?: Properties }) | undefined;
    code.data = Object.assign({}, data, { hName: 'span', hProperties: { ...data?.hProperties, className: ['sk-inline'] }, hChildren: children });
  }

  function visit(parent: Parent, file: MessageSink | undefined): void {
    parent.children.forEach((node, i) => {
      if (node.type === 'code' && node.lang && langs.has(node.lang)) parent.children[i] = sketch(node, file);
      else if (node.type === 'inlineCode' && inlineTags) tags(node);
      else if ('children' in node) visit(node, file);
    });
  }

  return (tree: Root, file?: MessageSink): undefined => {
    visit(tree, file);
  };
}
