/// <reference types="node" />
import { globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { parse, VIEWS, type ViewName } from '../src/index.ts';
import { format, project, projectData } from './fixture.ts';

// Files are listed at run time rather than with import.meta.glob, which Vitest's module cache
// would freeze, so a new fixture would not run until this file changed.
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const FIXTURES = join(ROOT, 'spec/fixtures');

/** Each view's fixtures are in a folder named after it, and have their own expected output. */
const PROJECTIONS: Record<ViewName, (source: string) => unknown> = { code: project, data: projectData };

for (const view of VIEWS) {
  const dir = join(FIXTURES, view.name);
  const fixtures = globSync('**/*.skeudo', { cwd: dir }).sort();

  describe(`${view.name} fixtures`, () => {
    test('exist', () => {
      expect(fixtures.length).toBeGreaterThan(0);
    });

    for (const name of fixtures) {
      test(name, async () => {
        const source = readFileSync(join(dir, name), 'utf8');
        expect(parse(source).view).toBe(view.name);
        const expected = join(dir, name.replace(/\.skeudo$/, '.json'));
        await expect(format(PROJECTIONS[view.name](source)) + '\n').toMatchFileSnapshot(expected);
      });
    }
  });
}

describe('sketches in the docs parse without warnings', () => {
  const docs = [...globSync('spec/*.md', { cwd: ROOT }), ...globSync('skills/skeudo/**/*.md', { cwd: ROOT })].sort();
  for (const doc of docs) {
    const text = readFileSync(join(ROOT, doc), 'utf8');
    // The skill's output template holds a placeholder fence whose body is just "...".
    const blocks = [...text.matchAll(/^```skeudo\n([\s\S]*?)^```/gm)]
      .map((m) => m[1])
      .filter((b) => b.trim() !== '...');

    test(`${doc} has sketches`, () => {
      expect(blocks.length).toBeGreaterThan(0);
    });

    for (const [i, block] of blocks.entries()) {
      test(`${doc} #${i + 1}: ${block.split('\n')[0].trim()}`, () => {
        expect(parse(block).diagnostics).toEqual([]);
      });
    }
  }
});
