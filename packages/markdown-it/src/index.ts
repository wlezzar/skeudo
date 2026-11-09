import type { MarkdownIt } from 'markdown-it';
import { FENCE_LANGS, parseTagsOnly, type CodeSketch, type ResolvedSrc } from '@skeudo/core';
import { tagHtml, toHtml, type HtmlOptions, type SrcLink } from '@skeudo/html';

export { FENCE_LANGS };

export interface SkeudoPluginOptions extends Omit<HtmlOptions, 'srcHref'> {
  /**
   * Builds a link for a source location, as in HtmlOptions. It also gets the env given to markdown-it's
   * render, such as the `currentDocument` VS Code's preview passes.
   */
  srcHref?: (loc: ResolvedSrc, sketch: CodeSketch, env: Record<string, unknown>) => string | SrcLink | undefined;
  /** Fence languages rendered as sketches. Defaults to FENCE_LANGS. */
  langs?: string[];
  /** Render inline code made only of tags, such as `::read:postgres`, as pills. Defaults to true. */
  inlineTags?: boolean;
}

/** markdown-it plugin: renders ```skeudo fences (and ```sketch) with the Skeudo renderer. */
export default function markdownItSkeudo(md: MarkdownIt, options: SkeudoPluginOptions = {}): void {
  const langs = new Set(options.langs ?? FENCE_LANGS);

  const fence = md.renderer.rules.fence!;
  md.renderer.rules.fence = (tokens, idx, opts, env, self) => {
    const token = tokens[idx];
    const lang = token.info.trim().split(/\s+/)[0];
    if (!langs.has(lang)) return fence(tokens, idx, opts, env, self);
    const { srcHref } = options;
    const html = toHtml(token.content, { ...options, srcHref: srcHref && ((loc, sketch) => srcHref(loc, sketch, env ?? {})) });
    // Keep attributes other plugins put on the fence, such as the source line an editor's preview scrolls to.
    return (token.attrs?.length ? `<div${self.renderAttrs(token)}>${html}</div>` : html) + '\n';
  };

  if (options.inlineTags !== false) {
    const inline = md.renderer.rules.code_inline!;
    md.renderer.rules.code_inline = (tokens, idx, opts, env, self) => {
      const tags = parseTagsOnly(tokens[idx].content);
      if (!tags) return inline(tokens, idx, opts, env, self);
      // Pills have no source links.
      const { srcHref: _srcHref, ...pillOptions } = options;
      return `<code class="sk-inline">${tags.map((t) => tagHtml(t, pillOptions)).join(' ')}</code>`;
    };
  }
}

export interface FrontMatter {
  /** `key: value` pairs, as plain strings. */
  data: Record<string, string>;
  /** The document after the front matter. */
  body: string;
  /** Lines the front matter takes, to map a line of `body` back to the document. */
  lines: number;
}

/** Splits simple front matter, `key: value` lines between `---` lines, from a Markdown document. */
export function frontMatter(source: string): FrontMatter {
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(source);
  if (!match) return { data: {}, body: source, lines: 0 };
  const data: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^(\w+):\s*(.*)$/.exec(line.trim());
    if (kv) data[kv[1]] = kv[2].replace(/^(["'])(.*)\1$/, '$2');
  }
  return { data, body: source.slice(match[0].length), lines: match[0].split('\n').length - 1 };
}

/** Extracts the source of every sketch fence in a Markdown document. */
export function sketchFences(md: MarkdownIt, source: string, langs: readonly string[] = FENCE_LANGS): { content: string; line: number }[] {
  return md
    .parse(source, {})
    .filter((t) => t.type === 'fence' && langs.includes(t.info.trim().split(/\s+/)[0]))
    .map((t) => ({ content: t.content, line: (t.map?.[0] ?? 0) + 1 }));
}
