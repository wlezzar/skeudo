import type { MarkdownIt } from 'markdown-it';
import { parseTagsOnly } from '@sketch/core';
import { tagHtml, toHtml, type HtmlOptions } from '@sketch/html';

export interface SketchPluginOptions extends HtmlOptions {
  /** Fence languages rendered as sketches. Defaults to `['sketch']`. */
  langs?: string[];
  /** Render inline code made only of tags, such as `::read:postgres`, as pills. Defaults to true. */
  inlineTags?: boolean;
}

/** markdown-it plugin: renders ```sketch fences with the Sketch renderer. */
export default function markdownItSketch(md: MarkdownIt, options: SketchPluginOptions = {}): void {
  const langs = new Set(options.langs ?? ['sketch']);

  const fence = md.renderer.rules.fence!;
  md.renderer.rules.fence = (tokens, idx, opts, env, self) => {
    const token = tokens[idx];
    const lang = token.info.trim().split(/\s+/)[0];
    if (langs.has(lang)) return toHtml(token.content, options) + '\n';
    return fence(tokens, idx, opts, env, self);
  };

  if (options.inlineTags !== false) {
    const inline = md.renderer.rules.code_inline!;
    md.renderer.rules.code_inline = (tokens, idx, opts, env, self) => {
      const tags = parseTagsOnly(tokens[idx].content);
      if (!tags) return inline(tokens, idx, opts, env, self);
      return `<code class="sk-inline">${tags.map((t) => tagHtml(t, options)).join(' ')}</code>`;
    };
  }
}

/** Extracts the source of every sketch fence in a Markdown document. */
export function sketchFences(md: MarkdownIt, source: string, langs = ['sketch']): { content: string; line: number }[] {
  return md
    .parse(source, {})
    .filter((t) => t.type === 'fence' && langs.includes(t.info.trim().split(/\s+/)[0]))
    .map((t) => ({ content: t.content, line: (t.map?.[0] ?? 0) + 1 }));
}
