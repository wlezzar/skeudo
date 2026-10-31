import { analyze, parse } from '../src';

/**
 * The expected output of a fixture: the AST with offsets and derivable fields removed,
 * plus label flows. spec/fixtures/README.md describes the shape.
 */
export function project(source: string): unknown {
  const sketch = parse(source);
  const { source: _source, variables, lines, ...rest } = sketch;
  return clean({
    ...rest,
    variables: Object.fromEntries(Object.values(variables).map(({ name, ...v }) => [name, v])),
    flows: analyze(sketch).flows.map((f) => ({
      line: f.line,
      variable: f.variable,
      labels: f.labels,
      effect: f.effect.tag.raw,
    })),
    lines: lines.map(({ children: _children, trailingStart: _trailingStart, tags, segments, ...line }) => ({
      ...line,
      tags: tags.map(({ start: _start, end: _end, raw, ...tag }) => ({ raw, ...tag })),
      segments: segments.map((s) => (s.type === 'tag' ? { type: 'tag', raw: s.tag.raw } : s)),
    })),
  });
}

/** Drops false, undefined, empty arrays and empty objects, so fixtures show only what is set. */
function clean(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(clean);
  if (value === null || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    const c = clean(v);
    if (c === false || c === undefined) continue;
    if (Array.isArray(c) && !c.length) continue;
    if (c !== null && typeof c === 'object' && !Array.isArray(c) && !Object.keys(c).length) continue;
    out[k] = c;
  }
  return out;
}

const WIDTH = 100;

function inline(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(inline).join(', ')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${inline(v)}`);
    return entries.length ? `{ ${entries.join(', ')} }` : '{}';
  }
  return JSON.stringify(value);
}

/** JSON that keeps an array or object on one line when it fits in WIDTH columns. */
export function format(value: unknown, indent = '', used = indent.length): string {
  const one = inline(value);
  if (used + one.length <= WIDTH || value === null || typeof value !== 'object') return one;
  const inner = indent + '  ';
  if (Array.isArray(value)) {
    return `[\n${value.map((v) => inner + format(v, inner)).join(',\n')}\n${indent}]`;
  }
  const entries = Object.entries(value).map(([k, v]) => {
    const key = `${inner}${JSON.stringify(k)}: `;
    return key + format(v, inner, key.length);
  });
  return `{\n${entries.join(',\n')}\n${indent}}`;
}
