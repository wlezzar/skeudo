import {
  CHANGE_KINDS,
  formatLocation,
  HIDDEN_KINDS,
  rollup,
  type CodeSketch,
  type ParseOptions,
  type ResolvedSrc,
  type RolledTag,
  type Rollup,
  type Segment,
  type SketchLine,
  type Tag,
} from '@skeudo/core';
import type { Element as HastElement, ElementContent } from 'hast';
import { classSafe, h, link, serialize, text } from '../shared/hast.ts';
import { textWidth } from '../shared/width.ts';
import { repoHref, type GitHost, type SrcLink } from './links.ts';

/** Options for rendering code sketches. */
export interface CodeHtmlOptions extends ParseOptions {
  /**
   * Builds a link for a source location in a sketch. Return undefined to show the location as a tooltip
   * only. Defaults to repoHref, which links to the repository the sketch names with `::repo`.
   */
  srcHref?: (loc: ResolvedSrc, sketch: CodeSketch) => string | SrcLink | undefined;
  /** Hosts of other GitHub, GitLab or Bitbucket servers, such as `{ 'git.example.com': 'gitlab' }`, for repoHref. */
  gitHosts?: Record<string, GitHost>;
  /** CSS colors for tag kinds, such as `{ todo: '#8b5cf6' }`. Overrides the defaults. */
  kindColors?: Record<string, string>;
}

const KNOWN_KINDS = new Set(['read', 'write', 'fail', 'src', 'repo', 'doc', 'fold', 'danger', 'unsure', 'untrusted', 'secret', ...CHANGE_KINDS]);
/** Tags a renderer hides: `::src` and `::repo` become links, `::doc` shows on hover, and `::fold` folds its block. */
const isHiddenTag = (tag: Tag) => HIDDEN_KINDS.has(tag.kind);
const DEFAULT_LABEL_KINDS = ['untrusted', 'secret'];

/** Text that is copied with the sketch but not shown, such as the `::` of a tag. */
const hiddenText = (s: string) => h('span', { className: ['sk-x'] }, text(s));

/** A link to a source location, through `srcHref`, with its note added to the tooltip. */
function srcLink(cls: string[], loc: ResolvedSrc, sketch: CodeSketch, opts: CodeHtmlOptions, title: string, children: ElementContent[]): HastElement {
  const found = (opts.srcHref ?? ((l, s) => (s.repo ? repoHref(s.repo, l, opts.gitHosts) : undefined)))(loc, sketch);
  const { href, note } = typeof found === 'string' ? { href: found, note: undefined } : (found ?? {});
  return link(note ? [...cls, 'sk-src-note'] : cls, href, note ? `${title}\n${note}` : title, children);
}

/**
 * Gives a call or a line's code an explanation, from `::doc`. enhance() shows it in a popover on hover
 * or focus; without enhance() it is the element's tooltip, before what the tooltip already said.
 */
function withDoc(el: HastElement, doc: string | undefined): HastElement {
  if (!doc) return el;
  const { title } = el.properties;
  (el.properties.className as string[]).push('sk-has-doc');
  el.properties.title = title ? `${doc}\n\n${title}` : doc;
  el.properties.dataDoc = doc;
  // A link already takes focus. Anything else needs to, so the explanation can be reached with the keyboard.
  if (el.tagName !== 'a') el.properties.tabIndex = 0;
  return el;
}

/** The `?` and `~` modifiers as written. */
const tagMods = (tag: Tag) => /^::[^?~:[]*([?~]*)/u.exec(tag.raw)?.[1] ?? '';

/** Builds one tag as a pill followed by its note, as a hast element. */
export function tagHast(tag: Tag, opts: CodeHtmlOptions = {}): HastElement {
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
export function tagHtml(tag: Tag, opts: CodeHtmlOptions = {}): string {
  return serialize(tagHast(tag, opts));
}

function varHast(sketch: CodeSketch, name: string, value: string, definition: boolean): HastElement {
  const labels = sketch.variables[name]?.labels ?? [];
  const cls = ['sk-var'];
  if (definition) cls.push('sk-def');
  for (const l of labels) cls.push('sk-lbl', `sk-lbl-${classSafe(l)}`);
  const title = labels.length ? { title: labels.join(', ') } : {};
  return h('span', { className: cls, dataVar: name, ...title }, text(value));
}

function segmentHast(seg: Segment, sketch: CodeSketch, opts: CodeHtmlOptions): ElementContent[] {
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
      const doc = sketch.callDocs[seg.name];
      const children = seg.head
        ? [varHast(sketch, seg.head, seg.head, false), ...text(seg.text.slice(seg.head.length))]
        : text(seg.text);
      if (!loc) return [withDoc(link(['sk-call'], undefined, '', children), doc)];
      return [withDoc(srcLink(['sk-call', 'sk-linked'], loc, sketch, opts, `Defined at ${formatLocation(loc)}`, children), doc)];
    }
    case 'tag':
      return isHiddenTag(seg.tag) ? [] : [tagHast(seg.tag, opts)];
  }
}

function gutterHast(src: ResolvedSrc | undefined, sketch: CodeSketch, opts: CodeHtmlOptions): HastElement[] {
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
 * to a step (`sk-fit-90` means 90ch). code.css moves a marked line's tags under its code when the
 * box is narrower. The constants mirror code.css.
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

/** Estimated width of a rendered tag and its note, in `ch` of the sketch font. */
function tagWidth(tag: Tag): number {
  let w = EM + textWidth(tag.kind) + tagMods(tag).length; // 0.5em of padding on each side
  if (tag.value) w += 0.8 * EM + textWidth(tag.value); // 0.4em of margin and 0.4em of padding around the divider
  if (tag.note) w += 0.4 * EM + textWidth(tag.note.text) + (tag.note.danger ? 1 + 0.25 * EM : 0);
  return w * TAG_SCALE + 0.25; // plus the pill's border
}

/** The marker after the code of a line with a `::doc`: 1ch of margin, then a circle 1.5em across at 0.72em. */
const DOC_MARK_WIDTH = 1 + 1.5 * 0.72 * EM;

function codeWidth(line: SketchLine, unit: number): number {
  let w = line.depth * unit;
  for (const seg of line.segments) {
    if (seg.type !== 'tag') w += textWidth(seg.text);
    else if (!isHiddenTag(seg.tag)) w += tagWidth(seg.tag);
  }
  if (line.doc) w += DOC_MARK_WIDTH;
  return w;
}

/** Estimated width of the gutter column (`.sk-gut`: 1rem of padding, then numbers at 0.78em). */
function gutterWidth(lines: SketchLine[], gutter: boolean): number {
  if (!gutter) return 2;
  const digits = Math.max(1, ...lines.map((l) => (l.src?.start !== undefined && !l.src.inherited ? String(l.src.start).length : 1)));
  return 2 + 0.78 * Math.max(4.5, 1.5 + digits);
}

/**
 * The `sk-fit-*` class for a line whose trailing tags (given as widths) may not fit in the tag column, if
 * any. `prefix` names the class: `sk-fit-90` and `sk-under`, or for a folded line `sk-ffit-90` and `sk-funder`.
 */
function fitClass(widths: number[], before: number, prefix = ''): string | undefined {
  if (!widths.length) return undefined;
  const column = TAG_COLUMN_PADDING + widths.reduce((a, b) => a + b, 0) + TAG_GAP * (widths.length - 1);
  if (column <= TAG_COLUMN_MIN) return undefined;
  const need = Math.ceil((before + column) / FIT_STEP) * FIT_STEP;
  if (need < FIT_MIN) return undefined;
  return need > FIT_MAX ? `sk-${prefix}under` : `sk-${prefix}fit-${need}`;
}

/** Text for the lines a rolled-up tag comes from: `On line 5`, `On lines 5 and 9`, `On lines 5, 7 and 9`. */
function onLines(lines: number[]): string {
  const list = [...new Set(lines)];
  if (list.length === 1) return `On line ${list[0]}`;
  return `On lines ${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

/** The tag a rolled-up tag shows as: the first of them, with their danger notes as its note and no other. */
function rolledTag(rolled: RolledTag): Tag {
  const { tag, dangers } = rolled;
  // A ::danger tag is amber already, so its note isn't marked again.
  const note = dangers.length ? { text: dangers.join('; '), danger: tag.kind !== 'danger' } : undefined;
  return { ...tag, note };
}

/**
 * A rolled-up tag as a pill, with a count when several lines carry it. The labeled variables that reach it
 * follow, as `← body`, underlined like their other uses, since the line that shows it is folded away.
 */
function rolledHast(rolled: RolledTag, sketch: CodeSketch, opts: CodeHtmlOptions): HastElement {
  const el = tagHast(rolledTag(rolled), opts);
  (el.properties.className as string[]).push('sk-rolled');
  if (rolled.removed) (el.properties.className as string[]).push('sk-rolled-removed');
  el.properties.title = `${onLines(rolled.lines)}${rolled.removed ? ', removed by the change' : ''}`;
  if (rolled.lines.length > 1) {
    const pill = el.children[0] as HastElement;
    pill.children.push(h('span', { className: ['sk-count'] }, text(`×${rolled.lines.length}`)));
  }
  if (rolled.flows.length) {
    const names = rolled.flows.flatMap((name, i) => [...(i ? text(', ') : []), varHast(sketch, name, name, false)]);
    const reach = rolled.flows.map((name) => `${name} (${sketch.variables[name]?.labels.join(', ')})`).join(', ');
    el.children.push(h('span', { className: ['sk-flow'], title: `${reach} reaches this effect` }, [h('span', { className: ['sk-arrow'] }, text('← ')), ...names]));
  }
  return el;
}

/** Estimated width of a rolled-up tag, with its count and the variables that reach it. */
function rolledWidth(rolled: RolledTag): number {
  const count = rolled.lines.length > 1 ? (0.35 * EM + textWidth(`×${rolled.lines.length}`)) * TAG_SCALE : 0;
  const flows = rolled.flows.length ? (0.4 * EM + textWidth(`← ${rolled.flows.join(', ')}`)) * TAG_SCALE : 0;
  return tagWidth(rolledTag(rolled)) + count + flows;
}

/** The ⋯ that starts a folded line's summary, and the padding around it, in `ch`. */
const ROLLUP_MARK_WIDTH = 2 + 0.9 * EM * TAG_SCALE;

/**
 * The summary a folded line shows in its tag column, after its own tags: a ⋯, then the tags of the lines
 * under it. Clicking it unfolds the block.
 */
function rollupHast(r: Rollup, sketch: CodeSketch, opts: CodeHtmlOptions): HastElement {
  const folded = `${r.lines} line${r.lines === 1 ? '' : 's'} folded`;
  const warnings = r.diagnostics.length ? `, ${r.diagnostics.length} with a warning` : '';
  return h('span', { className: ['sk-rollup'], title: `${folded}${warnings}. Click to unfold.` }, [
    h('span', { className: ['sk-more'], ariaHidden: 'true' }, text('⋯')),
    ...r.tags.map((t) => rolledHast(t, sketch, opts)),
  ]);
}

/** A line can fold when it is a block header other than the signature. */
const canFold = (line: SketchLine) => line.header && !line.signature;

/**
 * The lines hidden at first: the lines of every block tagged `::fold`. A blank line takes the depth of
 * the shallower line around it, so a blank line inside a block is hidden with it. enhance() does the same
 * each time a block is folded or unfolded.
 */
function hiddenAtFirst(lines: SketchLine[]): Set<number> {
  const hidden = new Set<number>();
  let foldDepth = -1;
  for (const line of lines) {
    if (foldDepth >= 0 && line.depth > foldDepth) {
      hidden.add(line.number);
      continue;
    }
    foldDepth = line.fold && canFold(line) ? line.depth : -1;
  }
  return hidden;
}

/** A file path that can break after each slash. */
function breakablePath(path: string): ElementContent[] {
  const parts = path.split('/');
  return parts.flatMap((part, i) => (i < parts.length - 1 ? [...text(`${part}/`), h('wbr', {})] : text(part)));
}

interface LineFold {
  /** What the line shows when its block is folded. */
  rollup?: Rollup;
  /** True when the line starts hidden, inside a folded block. */
  hidden: boolean;
}

function lineHast(line: SketchLine, sketch: CodeSketch, opts: CodeHtmlOptions, gutter: boolean, before: number, fold: LineFold): HastElement {
  const indent = ' '.repeat(line.depth * (sketch.indentUnit ?? 4));
  const cls = ['sk-row'];
  if (line.blank) cls.push('sk-blank');
  if (line.signature) cls.push('sk-sig');
  if (line.header) cls.push('sk-header');
  if (line.change) cls.push('sk-ch', `sk-ch-${line.change.kind}`);
  const diags = sketch.diagnostics.filter((d) => d.line === line.number);
  if (diags.length) cls.push('sk-has-diag');
  const { rollup: summary } = fold;
  if (summary) {
    cls.push('sk-foldable');
    if (line.fold) cls.push('sk-folded');
    if (summary.changes.length) cls.push('sk-ch-in', `sk-ch-in-${summary.changes[0]}`);
    if (summary.diagnostics.length) cls.push('sk-diag-in');
  }
  if (fold.hidden) cls.push('sk-hide');

  let code = line.segments.flatMap((s) => segmentHast(s, sketch, opts));
  // Wrapped so the strike-through of a removed line skips its indentation.
  if (code.length && line.change?.kind === 'removed') code = [h('span', { className: ['sk-struck'] }, code)];
  const trailing = line.tags.filter((t) => t.trailing && !isHiddenTag(t));
  const tags = trailing.map((t) => tagHast(t, opts));
  const widths = trailing.map(tagWidth);
  if (line.signature && line.src && sketch.file) {
    // Set at 0.78em. It can also break after a slash, when even the line under the code is too narrow.
    tags.push(srcLink(['sk-file'], line.src, sketch, opts, formatLocation(line.src), breakablePath(sketch.file)));
    widths.push(textWidth(sketch.file) * 0.78);
  }
  const fit = fitClass(widths, before);
  if (fit) cls.push(fit);
  if (summary) {
    tags.push(rollupHast(summary, sketch, opts));
    const ffit = fitClass([...widths, ROLLUP_MARK_WIDTH + summary.tags.reduce((w, t) => w + rolledWidth(t) + TAG_GAP, 0)], before, 'f');
    if (ffit) cls.push(ffit);
  }

  const title = diags.length ? { title: diags.map((d) => d.message).join('\n') } : {};
  // A line with an explanation gets a marker after its code. Its circle is drawn by code.css, so it isn't copied.
  const mark = line.doc ? [h('span', { className: ['sk-doc-mark'], ariaHidden: 'true' })] : [];
  // The indentation is an element with a width, not bare spaces, since some hosts drop whitespace-only
  // text: VitePress compiles Markdown pages as Vue templates, and Vue does.
  const ind = indent ? [h('span', { className: ['sk-ind'] }, text(indent))] : [];
  // The chevron that folds the block. code.css draws it, so copying the code leaves it out, and shows it
  // only once enhance() runs, since nothing could fold the block without it.
  const chevron = summary
    ? [h('button', { type: 'button', className: ['sk-fold'], ariaExpanded: line.fold ? 'false' : 'true', ariaLabel: line.fold ? 'Unfold block' : 'Fold block' })]
    : [];
  return h('div', { className: cls, style: `--d:${line.depth}`, dataLine: line.number, ...title }, [
    h('span', { className: ['sk-gut'] }, gutter ? gutterHast(line.src, sketch, opts) : []),
    withDoc(h('span', { className: ['sk-code'] }, [...ind, ...(code.length ? code : text('​')), ...mark, ...chevron]), line.doc),
    h('span', { className: ['sk-tags'] }, tags),
  ]);
}

/** Builds a code sketch as a hast tree: one `div.sketch` element. */
export function codeToHast(sketch: CodeSketch, opts: CodeHtmlOptions = {}): HastElement {
  const firstContent = sketch.lines.findIndex((l) => !l.blank);
  const lines = firstContent === -1 ? [] : sketch.lines.slice(firstContent).filter((l) => !l.hidden);
  const gutter = lines.some((l) => l.src);
  // Everything left of the tag column: the gutter and the widest line of code.
  const unit = sketch.indentUnit ?? 4;
  const before = gutterWidth(lines, gutter) + Math.max(0, ...lines.map((l) => codeWidth(l, unit)));
  const hidden = hiddenAtFirst(lines);
  const rows = lines.map((l) => {
    // A block of lines the renderer drops, such as ::src tags, has nothing to fold.
    const summary = canFold(l) ? rollup(sketch, l) : undefined;
    return lineHast(l, sketch, opts, gutter, before, { rollup: summary?.lines ? summary : undefined, hidden: hidden.has(l.number) });
  });
  return h('div', { className: gutter ? ['sketch', 'sk-gutter'] : ['sketch'], style: `--sk-indent:${unit}ch`, dataSketch: true }, [
    h('div', { className: ['sk-lines'] }, rows),
  ]);
}
