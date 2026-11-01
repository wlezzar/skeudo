/// <reference types="node" />
import { globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { parse } from '../src';
import { format, project } from './fixture';

// Files are listed at run time rather than with import.meta.glob, which Vitest's module cache
// would freeze, so a new fixture would not run until this file changed.
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const FIXTURES = join(ROOT, 'spec/fixtures');
const fixtures = globSync('**/*.skeudo', { cwd: FIXTURES }).sort();

describe('spec fixtures', () => {
  test('exist', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  for (const name of fixtures) {
    test(name, async () => {
      const source = readFileSync(join(FIXTURES, name), 'utf8');
      const expected = join(FIXTURES, name.replace(/\.skeudo$/, '.json'));
      await expect(format(project(source)) + '\n').toMatchFileSnapshot(expected);
    });
  }
});

describe('sketches in the docs parse without warnings', () => {
  for (const doc of ['spec/spec.md', 'skills/skeudo/SKILL.md']) {
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
