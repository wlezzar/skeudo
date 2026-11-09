import type { Element as HastElement, ElementContent, Properties, Text } from 'hast';

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);

/*
 * The renderer builds a hast tree (https://github.com/syntax-tree/hast), the HTML syntax tree that
 * remark and rehype plugins pass around, so a plugin can hand it on without parsing HTML. toHtml
 * serializes the same tree. Properties follow hast's naming: `className` for `class`, and camel case
 * for data attributes (`dataLine` for `data-line`).
 */

export function h(tagName: string, properties: Properties, children: ElementContent[] = []): HastElement {
  return { type: 'element', tagName, properties, children };
}

/** A text node, or none for an empty string. */
export const text = (value: string): Text[] => (value ? [{ type: 'text', value }] : []);

const VOID_ELEMENTS = new Set(['wbr', 'col']);

function attributeName(property: string): string {
  if (property === 'className') return 'class';
  if (property === 'tabIndex') return 'tabindex';
  const prefix = /^(data|aria)[A-Z]/.exec(property)?.[1];
  if (prefix) return `${prefix}${property.slice(prefix.length).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
  return property;
}

/** Serializes the elements and text the renderer builds. Invisible spaces are written as entities. */
export function serialize(node: ElementContent): string {
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

export const classSafe = (s: string) => s.replace(/[^\p{L}\p{N}_-]/gu, '_');

/** A link that opens in a new tab, or a plain span without an href. */
export function link(cls: string[], href: string | undefined, title: string, children: ElementContent[]): HastElement {
  const t = title ? { title } : {};
  return href
    ? h('a', { className: cls, href, target: '_blank', rel: ['noopener'], ...t }, children)
    : h('span', { className: cls, ...t }, children);
}
