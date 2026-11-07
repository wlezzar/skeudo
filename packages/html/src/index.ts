import {
  CHANGE_KINDS,
  formatLocation,
  parse,
  type ParseOptions,
  type Repo,
  type ResolvedSrc,
  type Segment,
  type Sketch,
  type SketchLine,
  type Tag,
} from '@skeudo/core';
import type { Element as HastElement, ElementContent, Properties, Text } from 'hast';

/** A link for a source location, with a note for its tooltip, such as a warning that the lines may have moved. */
export interface SrcLink {
  href: string;
  note?: string;
}

/** The kinds of code hosts repoHref can link to. */
export type GitHost = 'github' | 'gitlab' | 'bitbucket';

export interface HtmlOptions extends ParseOptions {
  /**
   * Builds a link for a source location in a sketch. Return undefined to show the location as a tooltip
   * only. Defaults to repoHref, which links to the repository the sketch names with `::repo`.
   */
  srcHref?: (loc: ResolvedSrc, sketch: Sketch) => string | SrcLink | undefined;
  /** Hosts of other GitHub, GitLab or Bitbucket servers, such as `{ 'git.example.com': 'gitlab' }`, for repoHref. */
  gitHosts?: Record<string, GitHost>;
  /** CSS colors for tag kinds, such as `{ todo: '#8b5cf6' }`. Overrides the defaults. */
  kindColors?: Record<string, string>;
}

const KNOWN_KINDS = new Set(['read', 'write', 'fail', 'src', 'repo', 'danger', 'unsure', 'untrusted', 'secret', ...CHANGE_KINDS]);
/** Tags a renderer hides, turning them into links. */
const isLinkTag = (tag: Tag) => tag.kind === 'src' || tag.kind === 'repo';
const DEFAULT_LABEL_KINDS = ['untrusted', 'secret'];

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);

/*
 * The renderer builds a hast tree (https://github.com/syntax-tree/hast), the HTML syntax tree that
 * remark and rehype plugins pass around, so a plugin can hand it on without parsing HTML. toHtml
 * serializes the same tree. Properties follow hast's naming: `className` for `class`, and camel case
 * for data attributes (`dataLine` for `data-line`).
 */

function h(tagName: string, properties: Properties, children: ElementContent[] = []): HastElement {
  return { type: 'element', tagName, properties, children };
}

/** A text node, or none for an empty string. */
const text = (value: string): Text[] => (value ? [{ type: 'text', value }] : []);

const VOID_ELEMENTS = new Set(['wbr']);

function attributeName(property: string): string {
  if (property === 'className') return 'class';
  if (/^data[A-Z]/.test(property)) return `data${property.slice(4).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
  return property;
}

/** Serializes the elements and text the renderer builds. Invisible spaces are written as entities. */
function serialize(node: ElementContent): string {
  if (node.type === 'text') return escapeHtml(node.value).replaceAll('​', '&#8203;');
  if (node.type !== 'element') return '';
  let attributes = '';
  for (const [property, value] of Object.entries(node.properties)) {
    if (value === undefined || value === null || value === false) continue;
    const name = attributeName(property);
    attributes += value === true ? ` ${name}` : ` ${name}="${escapeHtml(Array.isArray(value) ? value.join(' ') : String(value))}"`;
  }
  const open = `<${node.tagName}${attributes}>`;
  return VOID_ELEMENTS.has(node.tagName) ? open : `${open}${node.children.map(serialize).join('')}</${node.tagName}>`;
}

/** Text that is copied with the sketch but not shown, such as the `::` of a tag. */
const hiddenText = (s: string) => h('span', { className: ['sk-x'] }, text(s));
const classSafe = (s: string) => s.replace(/[^\p{L}\p{N}_-]/gu, '_');

function link(cls: string[], href: string | undefined, title: string, children: ElementContent[]): HastElement {
  const t = title ? { title } : {};
  return href
    ? h('a', { className: cls, href, target: '_blank', rel: ['noopener'], ...t }, children)
    : h('span', { className: cls, ...t }, children);
}

/** A link to a source location, through `srcHref`, with its note added to the tooltip. */
function srcLink(cls: string[], loc: ResolvedSrc, sketch: Sketch, opts: HtmlOptions, title: string, children: ElementContent[]): HastElement {
  const found = (opts.srcHref ?? ((l, s) => (s.repo ? repoHref(s.repo, l, opts.gitHosts) : undefined)))(loc, sketch);
  const { href, note } = typeof found === 'string' ? { href: found, note: undefined } : (found ?? {});
  return link(note ? [...cls, 'sk-src-note'] : cls, href, note ? `${title}\n${note}` : title, children);
}

/** The `?` and `~` modifiers as written. */
const tagMods = (tag: Tag) => /^::[^?~:[]*([?~]*)/u.exec(tag.raw)?.[1] ?? '';

/** Builds one tag as a pill followed by its note, as a hast element. */
export function tagHast(tag: Tag, opts: HtmlOptions = {}): HastElement {
  const labelKinds = opts.labelKinds ?? DEFAULT_LABEL_KINDS;
  const cls = ['sk-tag', `sk-k-${classSafe(tag.kind)}`];
  if (!KNOWN_KINDS.has(tag.kind)) cls.push('sk-other');
  if (tag.conditional) cls.push('sk-cond');
  if (tag.unverified) cls.push('sk-unv');
  if (tag.value === '*') cls.push('sk-rt');
  const color = opts.kindColors?.[tag.kind];
  const mods = tagMods(tag);

  const pill: ElementContent[] = [hiddenText('::'), h('span', { className: ['sk-kind'] }, text(tag.kind))];
  if (mods) pill.push(h('span', { className: ['sk-mod'] }, text(mods)));
  if (tag.value) {
    const isLabel = labelKinds.includes(tag.kind);
    pill.push(hiddenText(':'), h('span', { className: ['sk-val'], ...(isLabel ? { dataVar: tag.value } : {}) }, text(tag.value)));
  }
  const children = [h('span', { className: cls, ...(color ? { style: `--sk-c:${color}` } : {}) }, pill)];
  if (tag.note) {
    const { text: note, danger } = tag.note;
    children.push(
      h('span', { className: danger ? ['sk-note', 'sk-note-danger'] : ['sk-note'] }, [
        hiddenText('['),
        ...(danger ? [h('span', { className: ['sk-bang'] }, text('!'))] : []),
        ...text(note),
        hiddenText(']'),
      ]),
    );
  }
  return h('span', { className: ['sk-tagw'], title: tag.raw }, children);
}

/** Renders one tag as a pill, followed by its note. */
export function tagHtml(tag: Tag, opts: HtmlOptions = {}): string {
  return serialize(tagHast(tag, opts));
}

function varHast(sketch: Sketch, name: string, value: string, definition: boolean): HastElement {
  const labels = sketch.variables[name]?.labels ?? [];
  const cls = ['sk-var'];
  if (definition) cls.push('sk-def');
  for (const l of labels) cls.push('sk-lbl', `sk-lbl-${classSafe(l)}`);
  const title = labels.length ? { title: labels.join(', ') } : {};
  return h('span', { className: cls, dataVar: name, ...title }, text(value));
}

function segmentHast(seg: Segment, sketch: Sketch, opts: HtmlOptions): ElementContent[] {
  switch (seg.type) {
    case 'text':
      return text(seg.text);
    case 'word':
      return [h('span', { className: ['sk-word'] }, text(seg.text))];
    case 'fn':
      return [h('span', { className: ['sk-fn'] }, text(seg.text))];
    case 'var':
      return [varHast(sketch, seg.name, seg.text, seg.definition)];
    case 'call': {
      const loc = sketch.callSources[seg.name];
      const children = seg.head
        ? [varHast(sketch, seg.head, seg.head, false), ...text(seg.text.slice(seg.head.length))]
        : text(seg.text);
      if (!loc) return [link(['sk-call'], undefined, '', children)];
      return [srcLink(['sk-call', 'sk-linked'], loc, sketch, opts, `Defined at ${formatLocation(loc)}`, children)];
    }
    case 'tag':
      return isLinkTag(seg.tag) ? [] : [tagHast(seg.tag, opts)];
  }
}

/** A path in a URL, each part escaped. */
const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');
/** A location's path, without a leading `./`. */
const relativePath = (loc: ResolvedSrc) => loc.path!.replace(/^(\.?\/)+/, '');

/** The lines of a location as a URL fragment, in the form each host reads: `#L88-L94`, `#L88-94` or `#lines-88:94`. */
function linesFragment(loc: ResolvedSrc, host: GitHost = 'github'): string {
  if (loc.start === undefined) return '';
  const end = loc.end !== undefined && loc.end !== loc.start ? loc.end : undefined;
  if (host === 'bitbucket') return `#lines-${loc.start}${end === undefined ? '' : `:${end}`}`;
  return `#L${loc.start}${end === undefined ? '' : host === 'gitlab' ? `-${end}` : `-L${end}`}`;
}

/**
 * A `srcHref` that links source locations under a base URL, such as a GitHub blob URL at a commit
 * (`https://github.com/org/repo/blob/a1b2c3d/`). Lines become a fragment, as in `#L88-L94`.
 */
export function srcBaseHref(base: string): (loc: ResolvedSrc) => string | undefined {
  const root = base.endsWith('/') ? base : `${base}/`;
  return (loc) => (loc.path ? root + encodePath(relativePath(loc)) + linesFragment(loc) : undefined);
}

const KNOWN_HOSTS: Record<string, GitHost> = { 'github.com': 'github', 'gitlab.com': 'gitlab', 'bitbucket.org': 'bitbucket' };

/**
 * Links a source location to the repository a sketch names with `::repo`. A remote on GitHub, GitLab or
 * Bitbucket links to the file on that host at the revision, or at the default branch without one; give
 * other servers of those kinds in `hosts`. A `git+file://` folder links with a `file://` URL, and any
 * other URL is a base that the path is added to. Returns undefined for a host it doesn't know.
 */
export function repoHref(repo: Repo, loc: ResolvedSrc, hosts: Record<string, GitHost> = {}): string | undefined {
  if (!loc.path) return undefined;
  if (repo.type === 'base') return srcBaseHref(repo.url)(loc);
  if (repo.type === 'local') {
    // Keep a Windows drive, as in `file:///C:/code`, unescaped.
    const folder = repo.path.split('/').map((part, i) => (i === 0 && /^[a-z]:$/i.test(part) ? part : encodeURIComponent(part)));
    return srcBaseHref(`file://${repo.path.startsWith('/') ? '' : '/'}${folder.join('/')}`)(loc);
  }
  const host = hosts[repo.host] ?? KNOWN_HOSTS[repo.host];
  if (!host) return undefined;
  const rev = encodePath(repo.rev ?? 'HEAD');
  const view = host === 'github' ? 'blob' : host === 'gitlab' ? '-/blob' : 'src';
  return `https://${repo.host}/${encodePath(repo.path)}/${view}/${rev}/${encodePath(relativePath(loc))}${linesFragment(loc, host)}`;
}

function gutterHast(src: ResolvedSrc | undefined, sketch: Sketch, opts: HtmlOptions): HastElement[] {
  if (!src) return [];
  const where = formatLocation(src);
  if (src.inherited) {
    return [srcLink(['sk-src', 'sk-src-inherited'], src, sketch, opts, `${where} (from the enclosing block)`, text('·'))];
  }
  const label = src.start !== undefined ? String(src.start) : '↗';
  return [srcLink(['sk-src'], src, sketch, opts, where, text(label))];
}

/*
 * Tag column fit. The renderer can't measure the page, but a sketch is set in a monospace font, so it
 * can estimate widths in `ch`. For each line with trailing tags it works out how wide the box must be
 * for those tags to fit on one line in the tag column, and marks the line with that width rounded up
 * to a step (`sk-fit-90` means 90ch). sketch.css moves a marked line's tags under its code when the
 * box is narrower. The constants mirror sketch.css.
 */
const FIT_STEP = 10;
const FIT_MIN = 60;
const FIT_MAX = 250;
/** One `em` in `ch`, for a monospace font about 0.6em wide. */
const EM = 5 / 3;
/** Tags and notes are set at 0.8em. */
const TAG_SCALE = 0.8;
/** Gap between tags (0.45rem), and the tag column's padding (3ch on the left, 1rem on the right). */
const TAG_GAP = 0.9;
const TAG_COLUMN_PADDING = 5;
/** The tag column never gets narrower than this (`minmax(22ch, 1fr)`). */
const TAG_COLUMN_MIN = 22;

const WIDE_RE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{1f300}-\u{1faff}\u{20000}-\u{3fffd}]/u;

function textWidth(s: string): number {
  let w = 0;
  for (const c of s) w += WIDE_RE.test(c) ? 2 : 1;
  return w;
}

/** Estimated width of a rendered tag and its note, in `ch` of the sketch font. */
function tagWidth(tag: Tag): number {
  let w = EM + textWidth(tag.kind) + tagMods(tag).length; // 0.5em of padding on each side
  if (tag.value) w += 0.8 * EM + textWidth(tag.value); // 0.4em of margin and 0.4em of padding around the divider
  if (tag.note) w += 0.4 * EM + textWidth(tag.note.text) + (tag.note.danger ? 1 + 0.25 * EM : 0);
  return w * TAG_SCALE + 0.25; // plus the pill's border
}

function codeWidth(line: SketchLine, unit: number): number {
  let w = line.depth * unit;
  for (const seg of line.segments) {
    if (seg.type !== 'tag') w += textWidth(seg.text);
    else if (!isLinkTag(seg.tag)) w += tagWidth(seg.tag);
  }
  return w;
}

/** Estimated width of the gutter column (`.sk-gut`: 1rem of padding, then numbers at 0.78em). */
function gutterWidth(lines: SketchLine[], gutter: boolean): number {
  if (!gutter) return 2;
  const digits = Math.max(1, ...lines.map((l) => (l.src?.start !== undefined && !l.src.inherited ? String(l.src.start).length : 1)));
  return 2 + 0.78 * Math.max(4.5, 1.5 + digits);
}

/** The `sk-fit-*` class for a line whose trailing tags (given as widths) may not fit in the tag column, if any. */
function fitClass(widths: number[], before: number): string | undefined {
  if (!widths.length) return undefined;
  const column = TAG_COLUMN_PADDING + widths.reduce((a, b) => a + b, 0) + TAG_GAP * (widths.length - 1);
  if (column <= TAG_COLUMN_MIN) return undefined;
  const need = Math.ceil((before + column) / FIT_STEP) * FIT_STEP;
  if (need < FIT_MIN) return undefined;
  return need > FIT_MAX ? 'sk-under' : `sk-fit-${need}`;
}

/** A file path that can break after each slash. */
function breakablePath(path: string): ElementContent[] {
  const parts = path.split('/');
  return parts.flatMap((part, i) => (i < parts.length - 1 ? [...text(`${part}/`), h('wbr', {})] : text(part)));
}

function lineHast(line: SketchLine, sketch: Sketch, opts: HtmlOptions, gutter: boolean, before: number): HastElement {
  const indent = ' '.repeat(line.depth * (sketch.indentUnit ?? 4));
  const cls = ['sk-row'];
  if (line.blank) cls.push('sk-blank');
  if (line.signature) cls.push('sk-sig');
  if (line.header) cls.push('sk-header');
  if (line.change) cls.push('sk-ch', `sk-ch-${line.change.kind}`);
  const diags = sketch.diagnostics.filter((d) => d.line === line.number);
  if (diags.length) cls.push('sk-has-diag');

  let code = line.segments.flatMap((s) => segmentHast(s, sketch, opts));
  // Wrapped so the strike-through of a removed line skips its indentation.
  if (code.length && line.change?.kind === 'removed') code = [h('span', { className: ['sk-struck'] }, code)];
  const trailing = line.tags.filter((t) => t.trailing && !isLinkTag(t));
  const tags = trailing.map((t) => tagHast(t, opts));
  const widths = trailing.map(tagWidth);
  if (line.signature && line.src && sketch.file) {
    // Set at 0.78em. It can also break after a slash, when even the line under the code is too narrow.
    tags.push(srcLink(['sk-file'], line.src, sketch, opts, formatLocation(line.src), breakablePath(sketch.file)));
    widths.push(textWidth(sketch.file) * 0.78);
  }
  const fit = fitClass(widths, before);
  if (fit) cls.push(fit);

  const title = diags.length ? { title: diags.map((d) => d.message).join('\n') } : {};
  return h('div', { className: cls, style: `--d:${line.depth}`, dataLine: line.number, ...title }, [
    h('span', { className: ['sk-gut'] }, gutter ? gutterHast(line.src, sketch, opts) : []),
    h('span', { className: ['sk-code'] }, [...text(indent), ...(code.length ? code : text('​'))]),
    h('span', { className: ['sk-tags'] }, tags),
  ]);
}

/**
 * Builds a sketch (source text or an already parsed sketch) as a hast tree: one `div.sketch`
 * element, the same markup toHtml returns.
 */
export function toHast(input: string | Sketch, opts: HtmlOptions = {}): HastElement {
  const sketch = typeof input === 'string' ? parse(input, opts) : input;
  const firstContent = sketch.lines.findIndex((l) => !l.blank);
  const lines = firstContent === -1 ? [] : sketch.lines.slice(firstContent).filter((l) => !l.hidden);
  const gutter = lines.some((l) => l.src);
  // Everything left of the tag column: the gutter and the widest line of code.
  const unit = sketch.indentUnit ?? 4;
  const before = gutterWidth(lines, gutter) + Math.max(0, ...lines.map((l) => codeWidth(l, unit)));
  const rows = lines.map((l) => lineHast(l, sketch, opts, gutter, before));
  return h('div', { className: gutter ? ['sketch', 'sk-gutter'] : ['sketch'], style: `--sk-indent:${unit}ch`, dataSketch: true }, [
    h('div', { className: ['sk-lines'] }, rows),
  ]);
}

/** Renders a sketch (source text or an already parsed sketch) to an HTML string. */
export function toHtml(input: string | Sketch, opts: HtmlOptions = {}): string {
  return serialize(toHast(input, opts));
}

/**
 * Adds hover and click highlighting of variables: hovering a binding, parameter or labeled name
 * highlights all its uses within the same sketch; clicking pins the highlight.
 * Returns a function that removes the listeners.
 */
export function enhance(root: HTMLElement | Document = document): () => void {
  const target = (e: Event) => (e.target as Element | null)?.closest?.('[data-var]') ?? null;
  const mark = (el: Element, cls: string, on: boolean) => {
    const name = el.getAttribute('data-var')!;
    const scope = el.closest('[data-sketch], [data-sketch-scope]') ?? root;
    scope.querySelectorAll(`[data-var="${CSS.escape(name)}"]`).forEach((n) => n.classList.toggle(cls, on));
  };
  const over = (e: Event) => {
    const el = target(e);
    if (el) mark(el, 'sk-hl', true);
  };
  const out = (e: Event) => {
    const el = target(e);
    if (el) mark(el, 'sk-hl', false);
  };
  const click = (e: Event) => {
    const el = target(e);
    if (el && !el.closest('a')) mark(el, 'sk-pin', !el.classList.contains('sk-pin'));
  };
  root.addEventListener('mouseover', over);
  root.addEventListener('mouseout', out);
  root.addEventListener('click', click);
  return () => {
    root.removeEventListener('mouseover', over);
    root.removeEventListener('mouseout', out);
    root.removeEventListener('click', click);
  };
}
