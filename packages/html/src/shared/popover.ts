/*
 * The popover that explanations show in, for every view. It sits on the page's body with a fixed
 * position, since a sketch's box scrolls and would cut it off. It doesn't follow the page, so a view
 * hides it when anything scrolls. Its styles are in popover.css.
 */

/** How long the pointer rests on something before its explanation shows, in milliseconds. */
export const POPOVER_DELAY = 200;
/** Space between the popover and what it explains, and between the popover and the window's edge, in pixels. */
const GAP = 4;
const MARGIN = 8;
let popovers = 0;

/** One popover, created on the page's body the first time it shows. */
export class Popover {
  /** For `aria-describedby` on what the popover explains. */
  readonly id = `sk-doc-pop-${++popovers}`;
  private el: HTMLElement | undefined;

  constructor(private readonly doc: Document) {}

  /** Fills the popover with `content` and shows it. Place it next, with below() or beside(). */
  show(content: Node[]): void {
    if (!this.el?.isConnected) {
      this.el = this.doc.createElement('div');
      this.el.className = 'sk-doc-pop';
      this.el.id = this.id;
      this.el.setAttribute('role', 'tooltip');
      this.doc.body.append(this.el);
    }
    this.el.replaceChildren(...content);
    this.el.hidden = false;
  }

  /** Places the popover under `box`, or above it when there's no room below, starting at `left`. */
  below(box: DOMRect, left: number): void {
    const { width, height } = this.measure();
    const { vw, vh } = this.viewport();
    const under = box.bottom + GAP;
    const over = box.top - GAP - height;
    this.moveTo(left, under + height <= vh - MARGIN || over < MARGIN ? under : over, width, height, vw, vh);
  }

  /** Places the popover right of `box`, level with its top, or under it when there's no room on the right. */
  beside(box: DOMRect): void {
    const { width, height } = this.measure();
    const { vw, vh } = this.viewport();
    const left = box.right + 2 * GAP;
    if (left + width > vw - MARGIN) this.below(box, box.left);
    else this.moveTo(left, box.top, width, height, vw, vh);
  }

  /** Whether `node` is inside the popover. */
  contains(node: Node | null): boolean {
    return !!node && !!this.el?.contains(node);
  }

  hide(): void {
    if (this.el) this.el.hidden = true;
  }

  remove(): void {
    this.el?.remove();
  }

  private measure(): { width: number; height: number } {
    const el = this.el!;
    el.style.left = '0px';
    el.style.top = '0px';
    return el.getBoundingClientRect();
  }

  private viewport() {
    return { vw: this.doc.documentElement.clientWidth, vh: this.doc.documentElement.clientHeight };
  }

  private moveTo(left: number, top: number, width: number, height: number, vw: number, vh: number) {
    const el = this.el!;
    el.style.left = `${Math.max(MARGIN, Math.min(left, vw - width - MARGIN))}px`;
    el.style.top = `${Math.max(MARGIN, Math.min(top, vh - height - MARGIN))}px`;
  }
}
