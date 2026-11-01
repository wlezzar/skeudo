import {
  CHANGE_KINDS,
  formatLocation,
  parse,
  type ParseOptions,
  type ResolvedSrc,
  type Segment,
  type Sketch,
  type SketchLine,
  type Tag,
} from '@skeudo/core';

export interface HtmlOptions extends ParseOptions {
  /** Builds a link for a source location. Return undefined to show the location as a tooltip only. */
  srcHref?: (loc: ResolvedSrc) => string | undefined;
  /** CSS colors for tag kinds, such as `{ todo: '#8b5cf6' }`. Overrides the defaults. */
  kindColors?: Record<string, string>;
}

const KNOWN_KINDS = new Set(['read', 'write', 'fail', 'src', 'danger', 'unsure', 'untrusted', 'secret', ...CHANGE_KINDS]);
const DEFAULT_LABEL_KINDS = ['untrusted', 'secret'];

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);

/** Text that is copied with the sketch but not shown, such as the `::` of a tag. */
const hiddenText = (s: string) => `<span class="sk-x">${escapeHtml(s)}</span>`;
const classSafe = (s: string) => s.replace(/[^\p{L}\p{N}_-]/gu, '_');

function link(cls: string, href: string | undefined, title: string, inner: string): string {
  const t = title ? ` title="${escapeHtml(title)}"` : '';
  return href
    ? `<a class="${cls}" href="${escapeHtml(href)}" target="_blank" rel="noopener"${t}>${inner}</a>`
    : `<span class="${cls}"${t}>${inner}</span>`;
}

/** The `?` and `~` modifiers as written. */
const tagMods = (tag: Tag) => /^::[^?~:[]*([?~]*)/u.exec(tag.raw)?.[1] ?? '';

/** Renders one tag as a pill, followed by its note. */
export function tagHtml(tag: Tag, opts: HtmlOptions = {}): string {
  const labelKinds = opts.labelKinds ?? DEFAULT_LABEL_KINDS;
  const cls = ['sk-tag', `sk-k-${classSafe(tag.kind)}`];
  if (!KNOWN_KINDS.has(tag.kind)) cls.push('sk-other');
  if (tag.conditional) cls.push('sk-cond');
  if (tag.unverified) cls.push('sk-unv');
  if (tag.value === '*') cls.push('sk-rt');
  const color = opts.kindColors?.[tag.kind];
  const style = color ? ` style="--sk-c:${escapeHtml(color)}"` : '';
  const mods = tagMods(tag);

  let inner = hiddenText('::') + `<span class="sk-kind">${escapeHtml(tag.kind)}</span>`;
  if (mods) inner += `<span class="sk-mod">${escapeHtml(mods)}</span>`;
  if (tag.value) {
    const isLabel = labelKinds.includes(tag.kind);
    const varAttr = isLabel ? ` data-var="${escapeHtml(tag.value)}"` : '';
    inner += hiddenText(':') + `<span class="sk-val"${varAttr}>${escapeHtml(tag.value)}</span>`;
  }
  let html = `<span class="${cls.join(' ')}"${style}>${inner}</span>`;
  if (tag.note) {
    const { text, danger } = tag.note;
    html +=
      `<span class="sk-note${danger ? ' sk-note-danger' : ''}">` +
      hiddenText('[') +
      (danger ? `<span class="sk-bang">!</span>` : '') +
      escapeHtml(text) +
      hiddenText(']') +
      `</span>`;
  }
  return `<span class="sk-tagw" title="${escapeHtml(tag.raw)}">${html}</span>`;
}

function varHtml(sketch: Sketch, name: string, text: string, definition: boolean): string {
  const labels = sketch.variables[name]?.labels ?? [];
  const cls = ['sk-var'];
  if (definition) cls.push('sk-def');
  for (const l of labels) cls.push('sk-lbl', `sk-lbl-${classSafe(l)}`);
  const title = labels.length ? ` title="${escapeHtml(labels.join(', '))}"` : '';
  return `<span class="${cls.join(' ')}" data-var="${escapeHtml(name)}"${title}>${escapeHtml(text)}</span>`;
}

function segmentHtml(seg: Segment, sketch: Sketch, opts: HtmlOptions): string {
  switch (seg.type) {
    case 'text':
      return escapeHtml(seg.text);
    case 'word':
      return `<span class="sk-word">${escapeHtml(seg.text)}</span>`;
    case 'fn':
      return `<span class="sk-fn">${escapeHtml(seg.text)}</span>`;
    case 'var':
      return varHtml(sketch, seg.name, seg.text, seg.definition);
    case 'call': {
      const loc = sketch.callSources[seg.name];
      const inner = seg.head
        ? varHtml(sketch, seg.head, seg.head, false) + escapeHtml(seg.text.slice(seg.head.length))
        : escapeHtml(seg.text);
      return link(
        loc ? 'sk-call sk-linked' : 'sk-call',
        loc && opts.srcHref?.(loc),
        loc ? `Defined at ${formatLocation(loc)}` : '',
        inner,
      );
    }
    case 'tag':
      return seg.tag.kind === 'src' ? '' : tagHtml(seg.tag, opts);
  }
}

/**
 * A `srcHref` that links source locations under a base URL, such as a GitHub blob URL at a commit
 * (`https://github.com/org/repo/blob/a1b2c3d/`). Lines become a fragment, as in `#L88-L94`.
 */
export function srcBaseHref(base: string): (loc: ResolvedSrc) => string | undefined {
  const root = base.endsWith('/') ? base : `${base}/`;
  return (loc) => {
    if (!loc.path) return undefined;
    let url = root + loc.path.replace(/^(\.?\/)+/, '').split('/').map(encodeURIComponent).join('/');
    if (loc.start !== undefined) url += `#L${loc.start}`;
    if (loc.start !== undefined && loc.end !== undefined && loc.end !== loc.start) url += `-L${loc.end}`;
    return url;
  };
}

function gutterHtml(src: ResolvedSrc | undefined, opts: HtmlOptions): string {
  if (!src) return '';
  const where = formatLocation(src);
  if (src.inherited) {
    return link('sk-src sk-src-inherited', opts.srcHref?.(src), `${where} (from the enclosing block)`, '·');
  }
  const label = src.start !== undefined ? String(src.start) : '↗';
  return link('sk-src', opts.srcHref?.(src), where, label);
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

const WIDE_RE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{1f300}-\u{1faff}\u{20000}-\u{3fffd}]/u;

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
    else if (seg.tag.kind !== 'src') w += tagWidth(seg.tag);
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

function lineHtml(line: SketchLine, sketch: Sketch, opts: HtmlOptions, gutter: boolean, before: number): string {
  const indent = ' '.repeat(line.depth * (sketch.indentUnit ?? 4));
  const cls = ['sk-row'];
  if (line.blank) cls.push('sk-blank');
  if (line.signature) cls.push('sk-sig');
  if (line.header) cls.push('sk-header');
  if (line.change) cls.push('sk-ch', `sk-ch-${line.change.kind}`);
  const diags = sketch.diagnostics.filter((d) => d.line === line.number);
  if (diags.length) cls.push('sk-has-diag');
  const title = diags.length ? ` title="${escapeHtml(diags.map((d) => d.message).join('\n'))}"` : '';

  let code = line.segments.map((s) => segmentHtml(s, sketch, opts)).join('');
  // Wrapped so the strike-through of a removed line skips its indentation.
  if (code && line.change?.kind === 'removed') code = `<span class="sk-struck">${code}</span>`;
  const trailing = line.tags.filter((t) => t.trailing && t.kind !== 'src');
  const tags = trailing.map((t) => tagHtml(t, opts));
  const widths = trailing.map(tagWidth);
  if (line.signature && line.src && sketch.file) {
    // Set at 0.78em. It can also break after a slash, when even the line under the code is too narrow.
    const file = escapeHtml(sketch.file).replaceAll('/', '/<wbr>');
    tags.push(link('sk-file', opts.srcHref?.(line.src), formatLocation(line.src), file));
    widths.push(textWidth(sketch.file) * 0.78);
  }
  const fit = fitClass(widths, before);
  if (fit) cls.push(fit);

  return (
    `<div class="${cls.join(' ')}" style="--d:${line.depth}" data-line="${line.number}"${title}>` +
    `<span class="sk-gut">${gutter ? gutterHtml(line.src, opts) : ''}</span>` +
    `<span class="sk-code">${indent}${code || '&#8203;'}</span>` +
    `<span class="sk-tags">${tags.join('')}</span>` +
    `</div>`
  );
}

/** Renders a sketch (source text or an already parsed sketch) to an HTML string. */
export function toHtml(input: string | Sketch, opts: HtmlOptions = {}): string {
  const sketch = typeof input === 'string' ? parse(input, opts) : input;
  const firstContent = sketch.lines.findIndex((l) => !l.blank);
  const lines = firstContent === -1 ? [] : sketch.lines.slice(firstContent).filter((l) => !l.hidden);
  const gutter = lines.some((l) => l.src);
  // Everything left of the tag column: the gutter and the widest line of code.
  const unit = sketch.indentUnit ?? 4;
  const before = gutterWidth(lines, gutter) + Math.max(0, ...lines.map((l) => codeWidth(l, unit)));
  const rows = lines.map((l) => lineHtml(l, sketch, opts, gutter, before)).join('');
  const style = `--sk-indent:${sketch.indentUnit ?? 4}ch`;
  return (
    `<div class="sketch${gutter ? ' sk-gutter' : ''}" style="${style}" data-sketch>` +
    `<div class="sk-lines">${rows}</div></div>`
  );
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
