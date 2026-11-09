/*
 * Interaction for rendered data sketches, wired by enhance() in index.ts:
 * - Stepping: clicking a step or the arrows below the list shows that step's rows. The arrow keys, Home
 *   and End step through the story while the sketch has focus, since a page can hold several.
 * - References: hovering over one highlights the row it points at, and hovering over a row highlights
 *   the references to it.
 * - Explanations: resting on a step or a table's name shows its explanation in the shared popover.
 *   Clicking its "i" mark keeps it open until Escape, a click elsewhere, or another mark.
 */
import { Popover, POPOVER_DELAY } from '../shared/popover';

const SKETCH = '[data-skd]';

export function enhanceData(root: HTMLElement | Document): () => void {
  const off = [stepping(root), highlightReferences(root), showDocs(root)];
  return () => off.forEach((remove) => remove());
}

/** The step a sketch shows. */
const current = (sketch: Element) => Number(sketch.getAttribute('data-skd-step'));

function stepping(root: HTMLElement | Document): () => void {
  /**
   * The step each sketch showed, by its position under root. A preview that renders the page again on
   * each edit, as VS Code's does, then keeps the reader on their step.
   */
  const remembered = new Map<number, number>();
  const sketches = () => [...root.querySelectorAll<HTMLElement>(SKETCH)];

  function go(sketch: HTMLElement, step: number) {
    const count = Number(sketch.getAttribute('data-skd-steps'));
    if (!(step >= 0 && step < count)) return;
    sketch.setAttribute('data-skd-step', String(step));
    for (const body of sketch.querySelectorAll<HTMLElement>('tbody[data-skd-at]')) {
      body.hidden = Number(body.getAttribute('data-skd-at')) !== step;
    }
    for (const item of sketch.querySelectorAll('li[data-skd-at]')) {
      const at = Number(item.getAttribute('data-skd-at'));
      item.classList.toggle('skd-cur', at === step);
      item.classList.toggle('skd-past', at < step);
      const button = item.querySelector('.skd-go');
      if (at === step) button?.setAttribute('aria-current', 'step');
      else button?.removeAttribute('aria-current');
    }
    const prev = sketch.querySelector<HTMLButtonElement>('.skd-prev');
    const next = sketch.querySelector<HTMLButtonElement>('.skd-next');
    if (prev) prev.disabled = step === 0;
    if (next) next.disabled = step === count - 1;
    remembered.set(sketches().indexOf(sketch), step);
  }

  /** Starts each sketch not seen yet at its first step, or the step it showed before being rendered again. */
  function start() {
    sketches().forEach((sketch, i) => {
      if (sketch.hasAttribute('data-skd-live') || !Number(sketch.getAttribute('data-skd-steps'))) return;
      sketch.setAttribute('data-skd-live', '');
      go(sketch, Math.min(remembered.get(i) ?? 0, Number(sketch.getAttribute('data-skd-steps')) - 1));
    });
  }

  const click = (e: Event) => {
    const el = e.target as Element | null;
    const sketch = el?.closest?.<HTMLElement>(SKETCH);
    if (!sketch?.hasAttribute('data-skd-live') || el!.closest('.skd-mark')) return;
    const step = el!.closest('li[data-skd-at]');
    if (step) go(sketch, Number(step.getAttribute('data-skd-at')));
    else if (el!.closest('.skd-prev')) go(sketch, current(sketch) - 1);
    else if (el!.closest('.skd-next')) go(sketch, current(sketch) + 1);
  };
  const key = (e: Event) => {
    const event = e as KeyboardEvent;
    const sketch = (event.target as Element | null)?.closest?.<HTMLElement>(SKETCH);
    if (!sketch?.hasAttribute('data-skd-live') || event.altKey || event.ctrlKey || event.metaKey) return;
    const count = Number(sketch.getAttribute('data-skd-steps'));
    const step = {
      ArrowRight: current(sketch) + 1,
      ArrowDown: current(sketch) + 1,
      ArrowLeft: current(sketch) - 1,
      ArrowUp: current(sketch) - 1,
      Home: 0,
      End: count - 1,
    }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    go(sketch, step);
    // Focus follows the current step, so a screen reader reads it out.
    sketch.querySelector<HTMLElement>(`li[data-skd-at="${current(sketch)}"] .skd-go`)?.focus({ preventScroll: true });
  };

  start();
  const observer = new MutationObserver(start);
  observer.observe(root instanceof Document ? root.documentElement : root, { childList: true, subtree: true });
  root.addEventListener('click', click);
  root.addEventListener('keydown', key);
  return () => {
    observer.disconnect();
    root.removeEventListener('click', click);
    root.removeEventListener('keydown', key);
  };
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
    // Beside a step, so the list stays readable; under a table's name.
    const box = anchor.getBoundingClientRect();
    if (anchor.matches('li')) pop.beside(box);
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
