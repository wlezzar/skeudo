/*
 * Interaction for rendered data sketches, wired by enhance() in index.ts:
 * - Stepping: the story plays in frames, one for each substep and one for each step without substeps.
 *   Clicking a step or substep, or the arrows below the list, shows its frame; a step with substeps shows
 *   its first. The arrow keys, Home and End step through the frames while the sketch has focus, since a
 *   page can hold several.
 * - Reads: a line goes from the current step or substep to each row its reads find. The lines are drawn
 *   again when the sketch changes size or a table scrolls sideways.
 * - References: hovering over one highlights the row it points at, and hovering over a row highlights
 *   the references to it.
 * - Explanations: resting on a step, a substep or a table's name shows its explanation in the shared
 *   popover. Clicking its "i" mark keeps it open until Escape, a click elsewhere, or another mark.
 */
import { Popover, POPOVER_DELAY } from '../shared/popover';

const SKETCH = '[data-skd]';
const SVG = 'http://www.w3.org/2000/svg';

export function enhanceData(root: HTMLElement | Document): () => void {
  const off = [stepping(root), highlightReferences(root), showDocs(root)];
  return () => off.forEach((remove) => remove());
}

/** The frame a sketch shows. */
const current = (sketch: Element) => Number(sketch.getAttribute('data-skd-frame'));

function stepping(root: HTMLElement | Document): () => void {
  /**
   * The frame each sketch showed, by its position under root. A preview that renders the page again on
   * each edit, as VS Code's does, then keeps the reader on their step.
   */
  const remembered = new Map<number, number>();
  const sketches = () => [...root.querySelectorAll<HTMLElement>(SKETCH)];
  const win = (root instanceof Document ? root : root.ownerDocument).defaultView;
  // The lines follow the rows when the sketch changes size, as when the page is resized or fonts load.
  const resized = win?.ResizeObserver ? new win.ResizeObserver((entries) => entries.forEach((e) => drawLines(e.target as HTMLElement))) : undefined;
  const watched = new Set<HTMLElement>();

  function go(sketch: HTMLElement, frame: number) {
    const count = Number(sketch.getAttribute('data-skd-frames'));
    if (!(frame >= 0 && frame < count)) return;
    sketch.setAttribute('data-skd-frame', String(frame));
    for (const body of sketch.querySelectorAll<HTMLElement>('tbody[data-skd-at]')) {
      body.hidden = Number(body.getAttribute('data-skd-at')) !== frame;
    }
    for (const item of sketch.querySelectorAll('li[data-skd-at]')) {
      const at = Number(item.getAttribute('data-skd-at'));
      item.classList.toggle('skd-cur', at === frame);
      item.classList.toggle('skd-past', at < frame);
      const button = item.querySelector(':scope > .skd-go');
      if (at === frame) button?.setAttribute('aria-current', 'step');
      else button?.removeAttribute('aria-current');
    }
    // A step with substeps is current while one of them is.
    for (const item of sketch.querySelectorAll('li[data-skd-first]')) {
      const first = Number(item.getAttribute('data-skd-first'));
      const last = Number(item.getAttribute('data-skd-last'));
      item.classList.toggle('skd-cur', frame >= first && frame <= last);
      item.classList.toggle('skd-past', frame > last);
    }
    for (const el of sketch.querySelectorAll('[data-skd-on]')) {
      el.classList.toggle('skd-on', el.getAttribute('data-skd-on')!.split(' ').includes(String(frame)));
    }
    const prev = sketch.querySelector<HTMLButtonElement>('.skd-prev');
    const next = sketch.querySelector<HTMLButtonElement>('.skd-next');
    if (prev) prev.disabled = frame === 0;
    if (next) next.disabled = frame === count - 1;
    remembered.set(sketches().indexOf(sketch), frame);
    drawLines(sketch);
  }

  /** Starts each sketch not seen yet at its first frame, or the frame it showed before being rendered again. */
  function start() {
    for (const sketch of watched) {
      if (sketch.isConnected) continue;
      resized?.unobserve(sketch);
      watched.delete(sketch);
    }
    sketches().forEach((sketch, i) => {
      if (sketch.hasAttribute('data-skd-live') || !Number(sketch.getAttribute('data-skd-frames'))) return;
      sketch.setAttribute('data-skd-live', '');
      go(sketch, Math.min(remembered.get(i) ?? 0, Number(sketch.getAttribute('data-skd-frames')) - 1));
      resized?.observe(sketch);
      watched.add(sketch);
    });
  }

  const click = (e: Event) => {
    const el = e.target as Element | null;
    const sketch = el?.closest?.<HTMLElement>(SKETCH);
    if (!sketch?.hasAttribute('data-skd-live') || el!.closest('.skd-mark')) return;
    const item = el!.closest('li[data-skd-at]');
    const step = el!.closest('li[data-skd-first]');
    if (item) go(sketch, Number(item.getAttribute('data-skd-at')));
    else if (step) go(sketch, Number(step.getAttribute('data-skd-first')));
    else if (el!.closest('.skd-prev')) go(sketch, current(sketch) - 1);
    else if (el!.closest('.skd-next')) go(sketch, current(sketch) + 1);
  };
  const key = (e: Event) => {
    const event = e as KeyboardEvent;
    const sketch = (event.target as Element | null)?.closest?.<HTMLElement>(SKETCH);
    if (!sketch?.hasAttribute('data-skd-live') || event.altKey || event.ctrlKey || event.metaKey) return;
    const count = Number(sketch.getAttribute('data-skd-frames'));
    const frame = {
      ArrowRight: current(sketch) + 1,
      ArrowDown: current(sketch) + 1,
      ArrowLeft: current(sketch) - 1,
      ArrowUp: current(sketch) - 1,
      Home: 0,
      End: count - 1,
    }[event.key];
    if (frame === undefined) return;
    event.preventDefault();
    go(sketch, frame);
    // Focus follows the current step or substep, so a screen reader reads it out.
    sketch.querySelector<HTMLElement>(`li[data-skd-at="${current(sketch)}"] > .skd-go`)?.focus({ preventScroll: true });
  };
  // A table that scrolls sideways moves its rows under the lines. Scrolling doesn't bubble, so this listens while it is captured.
  const scroll = (e: Event) => {
    const el = e.target as Element | null;
    if (el?.closest?.('.skd-table, .skd-files')) drawLines(el.closest<HTMLElement>(SKETCH)!);
  };

  start();
  const observer = new MutationObserver(start);
  observer.observe(root instanceof Document ? root.documentElement : root, { childList: true, subtree: true });
  root.addEventListener('click', click);
  root.addEventListener('keydown', key);
  root.addEventListener('scroll', scroll, true);
  return () => {
    observer.disconnect();
    resized?.disconnect();
    root.removeEventListener('click', click);
    root.removeEventListener('keydown', key);
    root.removeEventListener('scroll', scroll, true);
  };
}

/**
 * Draws a line from the current step or substep to each row its reads find, or to the column names of a
 * table where a read finds nothing. The lines are an SVG over the sketch, and start at the right edge of
 * the step, level with the step or substep. Where the list is above the tables, they would cross it, so
 * there are none.
 */
function drawLines(sketch: HTMLElement) {
  let svg = sketch.querySelector<SVGSVGElement>(':scope > svg.skd-lines');
  const item = sketch.querySelector(`li[data-skd-at="${current(sketch)}"]`);
  const story = sketch.querySelector('.skd-story');
  const board = sketch.querySelector('.skd-board');
  const targets = new Set<Element>();
  for (const row of sketch.querySelectorAll<HTMLTableRowElement>('tbody:not([hidden]) tr.skd-read')) targets.add(row.cells[0]);
  for (const badge of sketch.querySelectorAll('.skd-nomatch.skd-on')) {
    const names = badge.closest('[data-skd-table]')?.querySelector('thead th');
    if (names) targets.add(names);
  }
  svg?.replaceChildren();
  if (!item || !story || !board || !targets.size) return;
  const beside = board.getBoundingClientRect().left >= story.getBoundingClientRect().right;
  if (!beside) return;
  if (!svg) {
    svg = sketch.ownerDocument.createElementNS(SVG, 'svg');
    svg.setAttribute('class', 'skd-lines');
    svg.setAttribute('aria-hidden', 'true');
    sketch.append(svg);
  }

  // In the sketch's coordinates: absolute positions start inside its border.
  const box = sketch.getBoundingClientRect();
  const left = box.left + sketch.clientLeft;
  const top = box.top + sketch.clientTop;
  const from = item.querySelector(':scope > .skd-go')!.getBoundingClientRect();
  const sx = item.closest('.skd-step')!.getBoundingClientRect().right - left + 2;
  const sy = from.top + from.height / 2 - top;
  let lines = '';
  let arrows = '';
  for (const target of targets) {
    const r = target.getBoundingClientRect();
    // A row scrolled out of its table's view: the line stops at the table's edge.
    const view = target.closest('.skd-table, .skd-files')?.getBoundingClientRect();
    const ex = Math.max(r.left, view?.left ?? r.left) - left - 3;
    const ey = r.top + r.height / 2 - top;
    // Leaves and arrives level. Handles any longer than half the way would loop where the rows are close.
    const dx = Math.max(0, ex - sx) / 2;
    lines += `M${sx},${sy}C${sx + dx},${sy} ${ex - dx},${ey} ${ex},${ey}`;
    arrows += `M${ex - 7},${ey - 3.5}L${ex},${ey}L${ex - 7},${ey + 3.5}Z`;
  }
  for (const [cls, d] of [
    ['skd-line', lines],
    ['skd-arrow', arrows],
  ]) {
    const path = sketch.ownerDocument.createElementNS(SVG, 'path');
    path.setAttribute('class', cls);
    path.setAttribute('d', d);
    svg.append(path);
  }
}

function highlightReferences(root: HTMLElement | Document): () => void {
  const lit: Element[] = [];
  const clear = () => lit.splice(0).forEach((el) => el.classList.remove('skd-hl'));
  const light = (els: Iterable<Element>) => {
    for (const el of els) {
      el.classList.add('skd-hl');
      lit.push(el);
    }
  };
  const over = (e: Event) => {
    clear();
    const el = e.target as Element | null;
    // Only the rows of the step that shows.
    const shown = el?.closest?.(SKETCH)?.querySelectorAll('tbody:not([hidden])');
    if (!shown) return;
    const within = (selector: string) => [...shown].flatMap((body) => [...body.querySelectorAll(selector)]);
    const ref = el!.closest('[data-skd-ref]');
    const row = el!.closest('tr[data-skd-row]');
    if (ref) light([ref, ...within(`tr[data-skd-row="${CSS.escape(ref.getAttribute('data-skd-ref')!)}"]`)]);
    else if (row) light(within(`[data-skd-ref="${CSS.escape(row.getAttribute('data-skd-row')!)}"]`));
  };
  const out = (e: Event) => {
    const to = (e as MouseEvent).relatedTarget as Node | null;
    if (!to || !(e.target as Element).closest?.(SKETCH)?.contains(to)) clear();
  };
  root.addEventListener('mouseover', over);
  root.addEventListener('mouseout', out);
  return () => {
    clear();
    root.removeEventListener('mouseover', over);
    root.removeEventListener('mouseout', out);
  };
}

function showDocs(root: HTMLElement | Document): () => void {
  const doc = root instanceof Document ? root : root.ownerDocument;
  const win = doc.defaultView;
  const pop = new Popover(doc);
  /** The step or table name whose explanation shows, or is about to. */
  let anchor: HTMLElement | undefined;
  /** Whether a click on the anchor's mark keeps the explanation open. */
  let pinned = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const owner = (e: Event) => ((e.target as Element | null)?.closest?.('[data-skd-doc]') as HTMLElement | null) ?? null;

  function show() {
    clearTimeout(timer);
    timer = undefined;
    if (!anchor) return;
    pop.show(
      (anchor.getAttribute('data-skd-doc') ?? '').split('\n\n').map((paragraph) => {
        const p = doc.createElement('p');
        p.textContent = paragraph;
        return p;
      }),
    );
    // Beside a step or substep, so the list stays readable; under a table's name.
    const box = anchor.getBoundingClientRect();
    if (anchor.closest('.skd-steps')) pop.beside(box);
    else pop.below(box, box.left);
    anchor.setAttribute('aria-describedby', pop.id);
    anchor.classList.add('skd-doc-on');
  }

  function hide() {
    clearTimeout(timer);
    timer = undefined;
    anchor?.removeAttribute('aria-describedby');
    anchor?.classList.remove('skd-doc-on');
    anchor = undefined;
    pinned = false;
    pop.hide();
  }

  function start(el: HTMLElement, delay: number) {
    if (el === anchor) return;
    // Moving from one explanation to the next doesn't wait again.
    const showing = !!anchor && timer === undefined;
    hide();
    anchor = el;
    if (delay && !showing) timer = setTimeout(show, delay);
    else show();
  }

  const over = (e: Event) => {
    if (pinned) return;
    const el = owner(e);
    if (el) start(el, POPOVER_DELAY);
    else if (anchor && !anchor.isConnected) hide();
  };
  const out = (e: Event) => {
    if (!pinned && anchor && !anchor.contains((e as MouseEvent).relatedTarget as Node | null)) hide();
  };
  const click = (e: Event) => {
    const mark = (e.target as Element | null)?.closest?.('.skd-mark');
    const el = mark?.closest<HTMLElement>('[data-skd-doc]');
    if (el && !(pinned && el === anchor)) {
      if (el !== anchor) {
        hide();
        anchor = el;
      }
      show();
      pinned = true;
    } else hide();
  };
  // A click elsewhere on the page, outside root, also closes a pinned explanation.
  const away = (e: Event) => {
    if (pinned && !(root instanceof Document) && !root.contains(e.target as Node)) hide();
  };
  const key = (e: Event) => {
    if ((e as KeyboardEvent).key === 'Escape') hide();
  };
  root.addEventListener('mouseover', over);
  root.addEventListener('mouseout', out);
  root.addEventListener('click', click);
  root.addEventListener('keydown', key);
  doc.addEventListener('click', away);
  win?.addEventListener('scroll', hide, true);
  win?.addEventListener('resize', hide);
  return () => {
    hide();
    pop.remove();
    root.removeEventListener('mouseover', over);
    root.removeEventListener('mouseout', out);
    root.removeEventListener('click', click);
    root.removeEventListener('keydown', key);
    doc.removeEventListener('click', away);
    win?.removeEventListener('scroll', hide, true);
    win?.removeEventListener('resize', hide);
  };
}
