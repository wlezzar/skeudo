import { describe, expect, test } from 'vitest';
import { toHtml } from '../src/index.ts';

const code = (html: string) => [...html.matchAll(/<span class="sk-code">(.*?)<\/span><span class="sk-tags">/g)].map((m) => m[1]);

describe('indentation', () => {
  test('puts a line’s indentation in an element, so hosts that drop whitespace-only text keep it', () => {
    const lines = code(toHtml('f(x):\n  if x:\n    g(x)\n'));
    expect(lines[0]).not.toContain('sk-ind');
    expect(lines[1].startsWith('<span class="sk-ind">  </span><span class="sk-word">if</span>')).toBe(true);
    expect(lines[2].startsWith('<span class="sk-ind">    </span><span class="sk-call">g</span>')).toBe(true);
  });
});
