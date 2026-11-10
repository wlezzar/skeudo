/*
 * Interaction for rendered code sketches, wired by enhance() in index.ts.
 */
import { Popover, POPOVER_DELAY } from '../shared/popover.ts';

/** Variable highlighting and explanations for the code sketches under `root`. */
export function enhanceCode(root: HTMLElement | Document): () => void {
  const off = [highlightVariables(root), showDocs(root)];
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
