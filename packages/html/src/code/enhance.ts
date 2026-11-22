/*
 * Interaction for rendered code sketches, wired by enhance() in index.ts.
 */
import { Popover, POPOVER_DELAY } from '../shared/popover.ts';

/** Variable highlighting, explanations and folding for the code sketches under `root`. */
export function enhanceCode(root: HTMLElement | Document): () => void {
  const off = [highlightVariables(root), showDocs(root), folding(root)];
  return () => off.forEach((remove) => remove());
}

function highlightVariables(root: HTMLElement | Document): () => void {
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

/** A sketch row's depth, from the `--d` its style sets. */
const rowDepth = (row: Element) => Number((row as HTMLElement).style.getPropertyValue('--d')) || 0;

/** Each foldable header of a code sketch, with a key that finds it again when the sketch is rendered again: its code, and which of the headers with that code it is. */
function foldableRows(sketch: Element): { key: string; row: Element }[] {
  const seen = new Map<string, number>();
  return [...sketch.querySelectorAll('.sk-foldable')].map((row) => {
    const code = row.querySelector('.sk-code')?.textContent ?? '';
    const n = (seen.get(code) ?? 0) + 1;
    seen.set(code, n);
    return { key: `${code}\u0000${n}`, row };
  });
}

/**
 * Folding. The chevron on a block header folds or unfolds its block, and clicking a folded line's
 * summary unfolds it. The renderer marks which lines start folded and hidden; code.css acts on those
 * marks only under `sk-folding`, which this puts on the root, so a page without enhance() shows every line.
 */
function folding(root: HTMLElement | Document): () => void {
  const host = root instanceof Document ? root.documentElement : root;
  host.classList.add('sk-folding');
  const win = (root instanceof Document ? root : root.ownerDocument).defaultView;
  const address = () => (win ? win.location.pathname + win.location.search : '');
  let page = address();
  /**
   * The blocks the reader folded or opened, by the sketch's position under root and the header's key,
   * with whether the markup started the block folded. A preview that renders the page again on each edit,
   * as VS Code's does, then keeps each block as the reader left it, unless the edit added or removed its
   * `::fold`. It is forgotten when the page's address changes, as for the steps of data sketches.
   */
  const remembered = new Map<number, Map<string, { folded: boolean; markup: boolean }>>();
  const sketches = () => [...root.querySelectorAll('[data-sketch]')];

  /** Puts back the blocks of each sketch not seen yet as the reader left them, and remembers how its markup starts them. */
  function start() {
    if (address() !== page) {
      remembered.clear();
      page = address();
    }
    sketches().forEach((sketch, i) => {
      if (sketch.hasAttribute('data-sk-live')) return;
      sketch.setAttribute('data-sk-live', '');
      const before = remembered.get(i);
      const now = new Map<string, { folded: boolean; markup: boolean }>();
      for (const { key, row } of foldableRows(sketch)) {
        const markup = row.classList.contains('sk-folded');
        const left = before?.get(key);
        const folded = left && left.markup === markup ? left.folded : markup;
        if (folded !== markup) setFolded(row, folded);
        now.set(key, { folded, markup });
      }
      remembered.set(i, now);
    });
  }

  const click = (e: Event) => {
    // A variable in a summary, as in `← body`, pins its highlight instead.
    if ((e.target as Element | null)?.closest?.('[data-var]')) return;
    const el = (e.target as Element | null)?.closest?.('.sk-fold, .sk-folded > .sk-tags > .sk-rollup');
    const row = el?.closest('.sk-row');
    const sketch = row?.closest('[data-sketch]');
    if (!row || !sketch) return;
    e.preventDefault();
    const folded = !row.classList.contains('sk-folded');
    setFolded(row, folded);
    const entry = remembered.get(sketches().indexOf(sketch))?.get(foldableRows(sketch).find((r) => r.row === row)?.key ?? '');
    if (entry) entry.folded = folded;
  };

  start();
  const observer = new MutationObserver(start);
  observer.observe(host, { childList: true, subtree: true });
  root.addEventListener('click', click);
  return () => {
    observer.disconnect();
    host.classList.remove('sk-folding');
    root.removeEventListener('click', click);
  };
}

function setFolded(row: Element, folded: boolean) {
  row.classList.toggle('sk-folded', folded);
  const button = row.querySelector('.sk-fold');
  button?.setAttribute('aria-expanded', String(!folded));
  button?.setAttribute('aria-label', folded ? 'Unfold block' : 'Fold block');
  if (row.parentElement) hideFolded(row.parentElement);
}

/**
 * Hides the lines inside folded blocks, and shows the others, as the renderer does for the blocks that
 * start folded. A blank line takes the depth of the shallower line around it, so one inside a block is
 * hidden with it.
 */
function hideFolded(lines: Element) {
  let foldDepth = -1;
  for (const row of lines.children) {
    const depth = rowDepth(row);
    const hidden = foldDepth >= 0 && depth > foldDepth;
    row.classList.toggle('sk-hide', hidden);
    if (!hidden) foldDepth = row.classList.contains('sk-folded') ? depth : -1;
  }
}

/**
 * Unfolds the blocks around a row of a code sketch, so the row shows, as clicks on their chevrons would,
 * so enhance() remembers them open.
 */
export function unfoldTo(row: Element) {
  let depth = rowDepth(row);
  for (let r = row.previousElementSibling; r && depth > 0; r = r.previousElementSibling) {
    if (r.classList.contains('sk-blank') || rowDepth(r) >= depth) continue;
    depth = rowDepth(r);
    if (r.classList.contains('sk-folded')) r.querySelector<HTMLElement>('.sk-fold')?.click();
  }
}

/**
 * Shows the explanation of a call or a line in a popover. The popover sits on the page's body with a
 * fixed position, since the sketch's box scrolls and would cut it off. It stands in for the element's
 * tooltip, which is removed while the pointer or focus is on the element and put back after.
 */
function showDocs(root: HTMLElement | Document): () => void {
  const doc = root instanceof Document ? root : root.ownerDocument;
  const win = doc.defaultView;
  const pop = new Popover(doc);
  /** The element whose explanation is shown, or is about to be. */
  let anchor: HTMLElement | undefined;
  /** The anchor's tooltip, while it is removed. */
  let title: string | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const target = (e: Event) => ((e.target as Element | null)?.closest?.('[data-doc]') as HTMLElement | null) ?? null;

  /** The rows a line's explanation covers: the line, and the lines of its block when it is a header. */
  function scope(el: HTMLElement): Element[] {
    const row = el.classList.contains('sk-code') ? el.closest('.sk-row') : null;
    if (!row?.classList.contains('sk-header')) return [];
    const rows = [row];
    const depth = rowDepth(row);
    for (let r = row.nextElementSibling; r && rowDepth(r) > depth; r = r.nextElementSibling) rows.push(r);
    return rows;
  }

  /** Under the line, so it doesn't cover it. A call's explanation starts at the call, a line's where its text starts. */
  function place(el: HTMLElement) {
    const start = el.classList.contains('sk-code')
      ? ([...el.children].find((c) => !c.classList.contains('sk-x') && !c.classList.contains('sk-doc-mark')) ?? el)
      : el;
    pop.below((el.closest('.sk-row') ?? el).getBoundingClientRect(), start.getBoundingClientRect().left);
  }

  function show() {
    clearTimeout(timer);
    timer = undefined;
    if (!anchor) return;
    const text = anchor.getAttribute('data-doc') ?? '';
    // The rest of the tooltip, such as where a call is defined, goes under the explanation.
    const rest = title?.startsWith(text) ? title.slice(text.length).trim() : '';
    const main = doc.createElement('div');
    main.className = 'sk-doc-text';
    main.textContent = text;
    const content: Node[] = [main];
    if (rest) {
      const info = doc.createElement('div');
      info.className = 'sk-doc-info';
      info.textContent = rest;
      content.push(info);
    }
    pop.show(content);
    place(anchor);
    anchor.setAttribute('aria-describedby', pop.id);
    for (const row of scope(anchor)) row.classList.add('sk-doc-scope');
  }

  function hide() {
    clearTimeout(timer);
    timer = undefined;
    if (anchor) {
      if (title !== null) anchor.setAttribute('title', title);
      anchor.removeAttribute('aria-describedby');
      for (const row of scope(anchor)) row.classList.remove('sk-doc-scope');
    }
    anchor = undefined;
    title = null;
    pop.hide();
  }

  function start(el: HTMLElement, delay: number) {
    if (el === anchor) {
      // Focus on an element the pointer is resting on shows its explanation without waiting.
      if (timer !== undefined && !delay) show();
      return;
    }
    hide();
    anchor = el;
    // Removed now, so the browser never shows the tooltip as well.
    title = el.getAttribute('title');
    el.removeAttribute('title');
    if (delay) timer = setTimeout(show, delay);
    else show();
  }

  const over = (e: Event) => {
    const el = target(e);
    if (el) start(el, POPOVER_DELAY);
    // The sketch was rendered again under the pointer, as VS Code's preview does on each edit.
    else if (anchor && !anchor.isConnected) hide();
  };
  const out = (e: Event) => {
    if (anchor && !anchor.contains((e as MouseEvent).relatedTarget as Node | null)) hide();
  };
  const focusIn = (e: Event) => {
    const el = target(e);
    if (el) start(el, 0);
  };
  const focusOut = (e: Event) => {
    if (anchor && anchor.contains(e.target as Node)) hide();
  };
  const key = (e: Event) => {
    if ((e as KeyboardEvent).key === 'Escape') hide();
  };
  root.addEventListener('mouseover', over);
  root.addEventListener('mouseout', out);
  root.addEventListener('focusin', focusIn);
  root.addEventListener('focusout', focusOut);
  root.addEventListener('keydown', key);
  // The popover doesn't move with the page, so it goes away when anything scrolls.
  win?.addEventListener('scroll', hide, true);
  win?.addEventListener('resize', hide);
  return () => {
    hide();
    pop.remove();
    root.removeEventListener('mouseover', over);
    root.removeEventListener('mouseout', out);
    root.removeEventListener('focusin', focusIn);
    root.removeEventListener('focusout', focusOut);
    root.removeEventListener('keydown', key);
    win?.removeEventListener('scroll', hide, true);
    win?.removeEventListener('resize', hide);
  };
}
