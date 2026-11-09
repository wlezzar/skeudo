import markdownit, { type MarkdownIt } from 'markdown-it';
import { analyze, formatLocation, parse, parseTagsOnly, type Review, type Sketch } from '@skeudo/core';
import { enhance, escapeHtml as esc, repoHref, srcBaseHref, tagHtml, toHtml, type HtmlOptions } from '@skeudo/html';
import markdownItSkeudo, { FENCE_LANGS, sketchFences } from 'markdown-it-skeudo';
import '@skeudo/html/skeudo.css';
import './style.css';
import { examples } from './examples';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const editor = $<HTMLTextAreaElement>('#editor');
const exampleSelect = $<HTMLSelectElement>('#example');
const modeSelect = $<HTMLSelectElement>('#mode');
const srcBaseInput = $<HTMLInputElement>('#src-base');
const preview = $<HTMLDivElement>('#preview');
const review = $<HTMLDivElement>('#review');
const ast = $<HTMLPreElement>('#ast pre');
const status = $<HTMLSpanElement>('#status');
const reviewCount = $<HTMLSpanElement>('#review-count');

// ---------- Persistence (per-viewer convenience only) ----------
const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(`skeudo-playground:${key}`);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(`skeudo-playground:${key}`, value);
    } catch {
      /* storage unavailable */
    }
  },
};

// ---------- Theme ----------
const applyTheme = (theme: string | null) => {
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
};
applyTheme(store.get('theme'));
$('#theme').addEventListener('click', () => {
  const dark =
    document.documentElement.dataset.theme === 'dark' ||
    (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  const next = dark ? 'light' : 'dark';
  applyTheme(next);
  store.set('theme', next);
});

// ---------- Rendering options ----------
// The base comes from an example's front matter, so as in the CLI, it serves sketches that don't name their repository with ::repo.
function htmlOptions(): HtmlOptions {
  const base = srcBaseInput.value.trim();
  const underBase = base ? srcBaseHref(base) : undefined;
  return { srcHref: (loc, sketch) => (sketch.repo && repoHref(sketch.repo, loc)) || underBase?.(loc) };
}

function makeMarkdown(opts: HtmlOptions): MarkdownIt {
  return markdownit({ html: false, linkify: true }).use(markdownItSkeudo, opts);
}

// A fence of a sketch, in any of the fence languages the plugin renders.
const SKETCH_FENCE = new RegExp(`^\\s*(\`\`\`|~~~)\\s*(${FENCE_LANGS.join('|')})\\b`, 'm');

function detectMode(source: string): 'sketch' | 'markdown' {
  if (modeSelect.value === 'sketch' || modeSelect.value === 'markdown') return modeSelect.value;
  return SKETCH_FENCE.test(source) || /^#{1,6}\s/m.test(source) ? 'markdown' : 'sketch';
}

// ---------- Legend ----------
const LEGEND = [
  ['::read:postgres.users[lookup by key]', 'reads outside state'],
  ['::write:redis[5 min ttl]', 'changes outside state'],
  ['::write?:postgres.users', 'only under a hidden condition'],
  ['::write~:kafka.events', 'unverified'],
  ['::write:*', 'target decided at runtime'],
  ['::read:postgres.orders[!full scan]', 'danger note'],
  ['::fail:NotFound', 'abnormal outcome'],
  ['::danger[shared across tenants]', 'whole-line danger'],
  ['::untrusted:body', 'unvalidated input'],
  ['::secret:token', 'sensitive value'],
  ['::unsure[maybe async]', 'author is unsure'],
  ['::new', 'added by the change (a header: its whole block)'],
  ['::changed[was wall-clock time]', 'altered by the change'],
  ['::removed', 'taken away by the change (a header: its whole block)'],
  ['::todo[ask about retries]', 'any other kind'],
];
const legendHtml = () =>
  `<details class="legend"><summary>Legend</summary><dl>` +
  LEGEND.map(([src, label]) => `<dt>${(parseTagsOnly(src) ?? []).map((t) => tagHtml(t)).join(' ')}</dt><dd>${label}</dd>`).join('') +
  `<dt><span class="sk-word">if</span> <span class="sk-call">load_user</span>(<span class="sk-var">user_id</span>)</dt><dd>prose word · call · variable (hover or click it)</dd>` +
  `<dt><span class="sk-word">if</span> past due:<span class="sk-doc-mark" aria-hidden="true"></span></dt><dd>a line explained with ::doc (hover the line, or a call, to read it)</dd>` +
  `</dl></details>`;

// ---------- Review ----------
interface Parsed {
  sketch: Sketch;
  /** What analyze() finds in a code sketch. Other views have no review yet. */
  review?: Review;
  /** Line in the editor where the sketch starts (markdown mode). */
  offset: number;
}

function reviewHtml(items: Parsed[], markdown: boolean): string {
  if (!items.length) return `<p class="empty">No sketches found. In Markdown mode, put sketches in <code>\`\`\`skeudo</code> fences.</p>`;
  return items.map((item, index) => reviewSection(item, index, markdown)).join('');
}

function reviewSection({ sketch, review: r, offset }: Parsed, index: number, markdown: boolean): string {
  const ln = (line: number) => `<span class="rv-ln">L${line + offset - 1}</span>`;
  const row = (line: number, body: string, cls = '') =>
    `<li class="rv-row${cls ? ` ${cls}` : ''}" data-sketch-index="${index}" data-line="${line}">${ln(line)}<span class="rv-body">${body}</span></li>`;
  const stat = (n: number, label: string, cls = '') => `<span class="rv-stat ${n ? cls : 'zero'}"><b>${n}</b> ${label}${n === 1 ? '' : 's'}</span>`;
  const diagnostics = () => {
    if (!sketch.diagnostics.length) return '';
    let html = `<h3>Diagnostics</h3><ol class="rv-list">`;
    for (const d of sketch.diagnostics) html += row(d.line, `<span class="rv-flag rv-flag-warning">${d.severity}</span><span class="rv-ctx">${esc(d.message)}</span>`);
    return html + `</ol>`;
  };

  if (sketch.view === 'data' || !r) {
    let html = `<section class="rv">`;
    if (markdown) html += `<h2>${esc(`Data sketch at line ${offset}`)}</h2>`;
    if (sketch.view === 'data') {
      html += `<div class="rv-stats">${stat(sketch.tables.length, 'table')}${stat(sketch.steps.length, 'step')}${stat(sketch.diagnostics.length, 'warning', 'amber')}</div>`;
    }
    return html + diagnostics() + `</section>`;
  }
  // Removed effects are ones the code no longer has, so they aren't counted.
  const current = r.effects.filter((e) => e.change !== 'removed');
  const reads = current.filter((e) => e.direction === 'read').length;
  const writes = current.length - reads;
  const dangers = r.flags.filter((f) => f.kind === 'danger').length;

  const title = sketch.signature ? sketch.signature.name : `Sketch at line ${offset}`;
  let html = `<section class="rv" data-sketch-scope>`;
  if (markdown) html += `<h2>${esc(title)}</h2>`;
  const changes = r.changes.length ? stat(r.changes.length, 'change', 'green') : '';
  html += `<div class="rv-stats">${changes}${stat(reads, 'read', 'aqua')}${stat(writes, 'write', 'orange')}${stat(r.failures.length, 'failure', 'red')}${stat(dangers, 'danger', 'amber')}${stat(r.diagnostics.length, 'warning', 'amber')}</div>`;

  if (r.changes.length) {
    html += `<h3>Changes</h3><ol class="rv-list">`;
    for (const c of r.changes) {
      const scope = c.block ? `<span class="muted">whole block</span>` : '';
      const effects = c.effects.length
        ? `<span class="rv-effects${c.kind === 'removed' ? ' rv-removed' : ''}">${c.effects.map((e) => tagHtml(e.tag)).join(' ')}</span>`
        : '';
      html += row(c.line, `${tagHtml(c.tag)}<span class="rv-ctx">${esc(c.context)}</span>${scope}${effects}`);
    }
    html += `</ol>`;
  }

  if (r.systems.length) {
    html += `<h3>Systems touched</h3><table class="rv-table"><thead><tr><th>System</th><th>Parts</th><th>Reads</th><th>Writes</th></tr></thead><tbody>`;
    for (const s of r.systems) {
      html += `<tr><td><b>${esc(s.name)}</b></td><td>${s.parts.map(esc).join(', ') || '<span class="muted">—</span>'}</td><td class="num aqua">${s.reads || ''}</td><td class="num orange">${s.writes || ''}</td></tr>`;
    }
    html += `</tbody></table>`;
  }

  if (r.effects.length) {
    html += `<h3>Effects, in order</h3><ol class="rv-list">`;
    for (const e of r.effects) {
      html += row(e.line, `${tagHtml(e.tag)}<span class="rv-ctx">${esc(e.context)}</span>`, e.change === 'removed' ? 'rv-removed' : '');
    }
    html += `</ol>`;
  } else {
    html += `<h3>Effects</h3><p class="empty">No effects tagged. Under the contract, that claims this code touches nothing outside the process.</p>`;
  }

  if (r.failures.length) {
    html += `<h3>Failures</h3><ol class="rv-list">`;
    for (const f of r.failures) html += row(f.line, `${tagHtml(f.tag)}<span class="rv-ctx">${esc(f.condition || 'no condition given')}</span>`);
    html += `</ol>`;
  }

  if (r.flows.length) {
    html += `<h3>Labeled data reaching effects</h3><ol class="rv-list">`;
    for (const f of r.flows) {
      const labels = f.labels.map((l) => `sk-lbl sk-lbl-${l}`).join(' ');
      html += row(
        f.line,
        `<span class="sk-var ${labels}" data-var="${esc(f.variable)}">${esc(f.variable)}</span> <span class="muted">(${esc(f.labels.join(', '))})</span> <span class="arrow">→</span> ${tagHtml(f.effect.tag)}`,
      );
    }
    html += `</ol>`;
  }

  if (r.flags.length) {
    html += `<h3>Stop here</h3><ol class="rv-list">`;
    for (const f of r.flags) html += row(f.line, `<span class="rv-flag rv-flag-${f.kind}">${f.kind}</span><span class="rv-ctx">${esc(f.text)}</span>`);
    html += `</ol>`;
  }

  if (r.others.length) {
    html += `<h3>Other tags</h3><ol class="rv-list">`;
    for (const o of r.others) html += row(o.line, `${tagHtml(o.tag)}<span class="rv-ctx">${esc(o.context)}</span>`);
    html += `</ol>`;
  }

  const calls = Object.entries(sketch.callSources);
  if (calls.length) {
    html += `<h3>Call definitions</h3><ul class="rv-list plain">`;
    for (const [name, loc] of calls) html += `<li><span class="sk-call">${esc(name)}</span> <span class="muted">${esc(formatLocation(loc))}</span></li>`;
    html += `</ul>`;
  }

  return html + diagnostics() + `</section>`;
}

// ---------- Render loop ----------
function render() {
  const source = editor.value;
  const opts = htmlOptions();
  const mode = detectMode(source);
  let parsed: Parsed[];

  if (mode === 'markdown') {
    const md = makeMarkdown(opts);
    preview.innerHTML = `<article class="md">${md.render(source)}</article>`;
    parsed = sketchFences(md, source).map((f) => {
      const sketch = parse(f.content);
      return { sketch, review: sketch.view === 'code' ? analyze(sketch) : undefined, offset: f.line + 1 };
    });
  } else {
    const sketch = parse(source);
    parsed = [{ sketch, review: sketch.view === 'code' ? analyze(sketch) : undefined, offset: 1 }];
    preview.innerHTML = toHtml(sketch, opts) + (sketch.view === 'code' ? legendHtml() : '');
  }

  review.innerHTML = reviewHtml(parsed, mode === 'markdown');
  ast.textContent = JSON.stringify(
    parsed.map(({ sketch }) => {
      const { source: _source, ...rest } = sketch;
      return rest;
    }),
    null,
    2,
  );

  const warnings = parsed.reduce((n, p) => n + p.sketch.diagnostics.length, 0);
  const effects = parsed.reduce((n, p) => n + (p.review?.effects.filter((e) => e.change !== 'removed').length ?? 0), 0);
  reviewCount.textContent = String(effects);
  status.innerHTML =
    (mode === 'markdown' ? `Markdown · ${parsed.length} sketch${parsed.length === 1 ? '' : 'es'}` : `Sketch · ${source.split('\n').length} lines`) +
    (warnings ? ` · <span class="warn">${warnings} warning${warnings === 1 ? '' : 's'}</span>` : '');
}

let timer: number | undefined;
const scheduleRender = () => {
  clearTimeout(timer);
  timer = window.setTimeout(render, 80);
};

// ---------- Tabs ----------
function showTab(name: string) {
  document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  document.querySelectorAll<HTMLElement>('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== name));
  store.set('tab', name);
}
document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab!)));

// Clicking a review row jumps to that line in the preview.
review.addEventListener('click', (e) => {
  const row = (e.target as Element).closest<HTMLElement>('.rv-row');
  if (!row || (e.target as Element).closest('[data-var], a')) return;
  showTab('preview');
  const sketchEl = preview.querySelectorAll('[data-sketch]')[Number(row.dataset.sketchIndex)];
  const lineEl = sketchEl?.querySelector<HTMLElement>(`[data-line="${row.dataset.line}"]`);
  if (!lineEl) return;
  lineEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
  lineEl.classList.remove('flash');
  void lineEl.offsetWidth;
  lineEl.classList.add('flash');
});

// ---------- Editor ----------
editor.addEventListener('input', () => {
  store.set('source', editor.value);
  scheduleRender();
});

// Tab / Shift+Tab indent and dedent the selected lines by 4 spaces.
editor.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab' || e.ctrlKey || e.metaKey || e.altKey) return;
  e.preventDefault();
  const { value, selectionStart: start, selectionEnd: end } = editor;
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  if (start === end && !e.shiftKey) {
    editor.setRangeText('    ', start, end, 'end');
  } else {
    const block = value.slice(lineStart, end);
    const lines = block.split('\n');
    const changed = lines.map((l) => (e.shiftKey ? l.replace(/^ {1,4}/, '') : `    ${l}`));
    editor.setRangeText(changed.join('\n'), lineStart, end, 'preserve');
    const firstDelta = changed[0].length - lines[0].length;
    editor.selectionStart = Math.max(lineStart, start + firstDelta);
    editor.selectionEnd = end + changed.join('\n').length - block.length;
  }
  editor.dispatchEvent(new Event('input'));
});

// ---------- Controls ----------
const localGroup = document.createElement('optgroup');
localGroup.label = 'Local (gitignored)';
for (const ex of examples) (ex.local ? localGroup : exampleSelect).append(new Option(ex.title, ex.id));
if (localGroup.children.length) exampleSelect.append(localGroup);
const custom = new Option('Custom (edited)', 'custom');

function loadExample(id: string) {
  const ex = examples.find((x) => x.id === id) ?? examples[0];
  exampleSelect.value = ex.id;
  custom.remove();
  editor.value = ex.source;
  // Source links belong to the example: real repos bring their base, fictional ones have none.
  srcBaseInput.value = ex.srcBase ?? '';
  store.set('example', ex.id);
  store.set('source', ex.source);
  store.set('src-base', srcBaseInput.value);
  render();
}

exampleSelect.addEventListener('change', () => loadExample(exampleSelect.value));
editor.addEventListener('input', () => {
  if (exampleSelect.value !== 'custom') {
    exampleSelect.add(custom);
    exampleSelect.value = 'custom';
    store.set('example', 'custom');
  }
});
modeSelect.addEventListener('change', () => {
  store.set('mode', modeSelect.value);
  render();
});
srcBaseInput.addEventListener('input', () => {
  store.set('src-base', srcBaseInput.value);
  scheduleRender();
});

// ---------- Boot ----------
modeSelect.value = store.get('mode') ?? 'auto';
srcBaseInput.value = store.get('src-base') ?? '';
enhance(preview);
enhance(review);
showTab(store.get('tab') ?? 'preview');

const savedExample = store.get('example');
const savedSource = store.get('source');
if (savedExample === 'custom' && savedSource) {
  exampleSelect.add(custom);
  exampleSelect.value = 'custom';
  editor.value = savedSource;
  render();
} else {
  loadExample(savedExample ?? examples[0].id);
}
