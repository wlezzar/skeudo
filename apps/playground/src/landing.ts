/*
 * The landing page at /. Its sketches are spec fixtures, rendered here with the real renderer, so
 * the page shows what a reader gets. It imports the two fixtures rather than the playground's
 * examples, which would bring the whole spec into its bundle.
 */
import { parseTagsOnly } from '@skeudo/core';
import { enhance, escapeHtml as esc, tagHtml, toHtml } from '@skeudo/html';
import '@skeudo/html/skeudo.css';
import './tokens.css';
import './landing.css';
import signup from '../../../spec/fixtures/code/examples/signup.skeudo?raw';
import checkout from '../../../spec/fixtures/data/examples/checkout.skeudo?raw';
import { setUpTheme } from './theme';

setUpTheme(document.getElementById('theme')!);

const sources: Record<string, string> = { signup, checkout };
const source = (id: string) => sources[id] ?? '';

// The plain text, with each tag tinted, so the column of tags stands out as it does in an editor.
const TAG = /::[^\s[]+(?:\[[^\]]*\])?/g;
for (const el of document.querySelectorAll<HTMLElement>('[data-source]')) {
  const text = source(el.dataset.source!).trimEnd();
  let html = '';
  let last = 0;
  for (const m of text.matchAll(TAG)) {
    html += esc(text.slice(last, m.index)) + `<span class="source-tag">${esc(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  el.innerHTML = html + esc(text.slice(last));
}

for (const el of document.querySelectorAll<HTMLElement>('[data-render]')) {
  el.innerHTML = toHtml(source(el.dataset.render!));
}

const TAGS: [string, string][] = [
  ['::read:postgres.users[lookup by key]', 'Reads outside state, and says how.'],
  ['::write:redis[5 min ttl]', 'Changes outside state.'],
  ['::write?:postgres.users', 'Writes only under a condition the line doesn’t show.'],
  ['::write~:kafka.events', 'A write the author couldn’t confirm.'],
  ['::read:postgres.orders[!full scan]', 'A danger, flagged on the line where it happens.'],
  ['::fail:NotFound', 'An abnormal outcome.'],
  ['::untrusted:body', 'Input nobody has checked yet.'],
  ['::secret:token', 'A value that must not leak.'],
  ['::changed[was wall-clock time]', 'What a change alters, next to ::new and ::removed.'],
];
document.getElementById('tags')!.innerHTML = TAGS.map(
  ([src, meaning]) =>
    `<div class="tag-row"><dt>${(parseTagsOnly(src) ?? []).map((t) => tagHtml(t)).join(' ')}</dt><dd>${esc(meaning)}</dd></div>`,
).join('');

enhance(document);

for (const button of document.querySelectorAll<HTMLButtonElement>('.copy')) {
  button.addEventListener('click', async () => {
    const text = button.parentElement?.querySelector('code')?.textContent ?? '';
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = 'Copied';
    } catch {
      button.textContent = 'Select it';
    }
    setTimeout(() => (button.textContent = 'Copy'), 1500);
  });
}
