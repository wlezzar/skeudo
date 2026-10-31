import {
  formatLocation,
  parse,
  type ParseOptions,
  type ResolvedSrc,
  type Segment,
  type Sketch,
  type SketchLine,
  type Tag,
} from '@sketch/core';

export interface HtmlOptions extends ParseOptions {
  /** Builds a link for a source location. Return undefined to show the location as a tooltip only. */
  srcHref?: (loc: ResolvedSrc) => string | undefined;
  /** CSS colors for tag kinds, such as `{ todo: '#8b5cf6' }`. Overrides the defaults. */
  kindColors?: Record<string, string>;
}

const KNOWN_KINDS = new Set(['read', 'write', 'fail', 'src', 'danger', 'unsure', 'untrusted', 'secret']);
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
  const mods = /^::[^?~:[]*([?~]*)/u.exec(tag.raw)?.[1] ?? '';

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

function gutterHtml(src: ResolvedSrc | undefined, opts: HtmlOptions): string {
  if (!src) return '';
  const where = formatLocation(src);
  if (src.inherited) {
    return link('sk-src sk-src-inherited', opts.srcHref?.(src), `${where} (from the enclosing block)`, '·');
  }
  const label = src.start !== undefined ? String(src.start) : '↗';
  return link('sk-src', opts.srcHref?.(src), where, label);
}

function lineHtml(line: SketchLine, sketch: Sketch, opts: HtmlOptions, gutter: boolean): string {
  const indent = ' '.repeat(line.depth * (sketch.indentUnit ?? 4));
  const cls = ['sk-row'];
  if (line.blank) cls.push('sk-blank');
  if (line.signature) cls.push('sk-sig');
  if (line.header) cls.push('sk-header');
  const diags = sketch.diagnostics.filter((d) => d.line === line.number);
  if (diags.length) cls.push('sk-has-diag');
  const title = diags.length ? ` title="${escapeHtml(diags.map((d) => d.message).join('\n'))}"` : '';

  const code = line.segments.map((s) => segmentHtml(s, sketch, opts)).join('');
  const tags = line.tags.filter((t) => t.trailing && t.kind !== 'src').map((t) => tagHtml(t, opts));
  if (line.signature && line.src && sketch.file) {
    tags.push(link('sk-file', opts.srcHref?.(line.src), formatLocation(line.src), escapeHtml(sketch.file)));
  }

  return (
    `<div class="${cls.join(' ')}" data-line="${line.number}"${title}>` +
    `<span class="sk-gut">${gutter ? gutterHtml(line.src, opts) : ''}</span>` +
    `<span class="sk-code" style="--d:${line.depth}">${indent}${code || '&#8203;'}</span>` +
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
  const rows = lines.map((l) => lineHtml(l, sketch, opts, gutter)).join('');
  const style = `--sk-indent:${sketch.indentUnit ?? 4}ch`;
  return `<div class="sketch${gutter ? ' sk-gutter' : ''}" style="${style}" data-sketch>${rows}</div>`;
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
