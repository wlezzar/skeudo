import markdownit from 'markdown-it';
import { parse, type Diagnostic, type Sketch } from '@skeudo/core';
import { escapeHtml, repoHref, srcBaseHref, toHtml, type HtmlOptions } from '@skeudo/html';
import markdownItSkeudo, { FENCE_LANGS, frontMatter, sketchFences } from 'markdown-it-skeudo';

/** A Markdown document with sketch fences, or a sketch on its own. */
export interface Doc {
  /** Path as given, or `<stdin>`. */
  name: string;
  markdown: boolean;
  /** Front matter of a Markdown document, such as `title` and `srcBase`. */
  meta: Record<string, string>;
  /** The source after the front matter. */
  body: string;
  /** Lines the front matter takes. */
  offset: number;
  sketches: { sketch: Sketch; /** Line of the document the sketch starts on. */ line: number }[];
}

export interface Problem extends Diagnostic {
  /** Line in the document, not in the sketch. */
  line: number;
}

const MARKDOWN_EXT = /\.(md|markdown)$/i;
const SKEUDO_EXT = /\.skeudo$/i;
const SKETCH_FENCE = new RegExp(`^ {0,3}(\`{3,}|~{3,})[ \\t]*(${FENCE_LANGS.join('|')})(\\s|$)`, 'm');

/** Files a directory is searched for. */
export const isSketchFile = (path: string) => MARKDOWN_EXT.test(path) || SKEUDO_EXT.test(path);

/**
 * A `.md` or `.markdown` file is Markdown and a `.skeudo` file is a sketch. Anything else, stdin included,
 * is Markdown when it has a sketch fence, and a sketch otherwise.
 */
export function load(name: string, source: string): Doc {
  const markdown = MARKDOWN_EXT.test(name) || (!SKEUDO_EXT.test(name) && SKETCH_FENCE.test(source));
  if (!markdown) {
    const sketches = source.trim() ? [{ sketch: parse(source), line: 1 }] : [];
    return { name, markdown, meta: {}, body: source, offset: 0, sketches };
  }

  const { data, body, lines } = frontMatter(source);
  // A fence's content starts on the line after the fence.
  const sketches = sketchFences(markdownit(), body).map((f) => ({ sketch: parse(f.content), line: lines + f.line + 1 }));
  return { name, markdown, meta: data, body, offset: lines, sketches };
}

/** The parser's warnings, at their lines in the document. */
export function problems(doc: Doc): Problem[] {
  return doc.sketches.flatMap(({ sketch, line }) => sketch.diagnostics.map((d) => ({ ...d, line: line + d.line - 1 })));
}

export const formatProblem = (doc: Doc, p: Problem) => `${doc.name}:${p.line}: ${p.severity}: ${p.message}`;

export interface PageOptions {
  /** Base URL for `::src` links, given for this rendering. It wins over `::repo` and the front matter. */
  srcBase?: string;
  /** Stylesheet and script inlined into the page. */
  css: string;
  script: string;
}

/**
 * Links `::src` locations under the base given for this rendering. Without one, a sketch links to the
 * repository it names with `::repo`, and a sketch that names none links under the front matter's `srcBase`.
 */
function srcLinks(given: string | undefined, fallback: string | undefined): HtmlOptions['srcHref'] {
  if (given) return srcBaseHref(given);
  const underFallback = fallback ? srcBaseHref(fallback) : undefined;
  return (loc, sketch) => (sketch.repo && repoHref(sketch.repo, loc)) || underFallback?.(loc);
}

/** Renders a document as a standalone HTML page, with nothing loaded from elsewhere. */
export function renderPage(doc: Doc, opts: PageOptions): string {
  const html: HtmlOptions = { srcHref: srcLinks(opts.srcBase, doc.meta.srcBase) };
  let body: string;
  let heading: string | undefined;
  if (doc.markdown) {
    const md = markdownit({ html: false, linkify: true }).use(markdownItSkeudo, html);
    const env = {};
    const tokens = md.parse(doc.body, env);
    const h1 = tokens.findIndex((t) => t.type === 'heading_open' && t.tag === 'h1');
    if (h1 !== -1) heading = tokens[h1 + 1].children?.map((t) => (t.type === 'text' || t.type === 'code_inline' ? t.content : '')).join('');
    body = `<main>${md.renderer.render(tokens, md.options, env)}</main>`;
  } else {
    body = `<main class="bare">${doc.sketches.length ? toHtml(doc.sketches[0].sketch, html) : ''}</main>`;
  }
  const fileName = doc.name === '<stdin>' ? undefined : doc.name.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
  const first = doc.sketches[0]?.sketch;
  const title = doc.meta.title || heading || (first?.view === 'code' ? first.signature?.name : undefined) || fileName || 'Sketch';
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)}</title>`,
    `<style>\n${opts.css}</style>`,
    '</head>',
    '<body>',
    body,
    // Variable highlighting. `</` can't appear inside a script element.
    `<script>${opts.script.replace(/<\//g, '<\\/')}</script>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
