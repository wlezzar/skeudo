import { describe, expect, test } from 'vitest';
import { frontMatter } from '../src/index';

describe('frontMatter', () => {
  test('splits key: value lines from the document, and counts the lines they take', () => {
    expect(frontMatter('---\ntitle: shop a1b2c3d\nsrcBase: https://github.com/org/shop/blob/a1b2c3d/\n---\n# Doc\n')).toEqual({
      data: { title: 'shop a1b2c3d', srcBase: 'https://github.com/org/shop/blob/a1b2c3d/' },
      body: '# Doc\n',
      lines: 4,
    });
  });

  test('drops quotes around a value, and reads CRLF line endings', () => {
    expect(frontMatter('---\r\ntitle: "Refunds: v2"\r\n---\r\nbody')).toEqual({ data: { title: 'Refunds: v2' }, body: 'body', lines: 3 });
  });

  test('leaves a document without front matter as it is', () => {
    const doc = '# Doc\n\n---\ntitle: no\n---\n';
    expect(frontMatter(doc)).toEqual({ data: {}, body: doc, lines: 0 });
  });
});
