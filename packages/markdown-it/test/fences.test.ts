import markdownit from 'markdown-it';
import { describe, expect, test } from 'vitest';
import markdownItSkeudo, { sketchFences } from '../src/index';

const FENCE = '```';
const fenced = (lang: string, body: string) => `${FENCE}${lang}\n${body}${FENCE}\n`;
const SKETCH = 'get_user(id):\n    row = find(id)    ::read:postgres.users\n';

const render = (source: string, options: { langs?: string[] } = {}) => markdownit().use(markdownItSkeudo, options).render(source);

describe('sketch fences', () => {
  test('renders skeudo fences, and the sketch fences of documents written before the rename', () => {
    expect(render(fenced('skeudo', SKETCH))).toContain('<div class="sketch');
    expect(render(fenced('sketch', SKETCH))).toContain('<div class="sketch');
  });

  test('leaves other fences alone', () => {
    expect(render(fenced('python', 'print(1)\n'))).not.toContain('class="sketch');
  });

  test('renders only the languages it is given, when given some', () => {
    expect(render(fenced('sketch', SKETCH), { langs: ['skeudo'] })).not.toContain('class="sketch');
  });

  test('links ::src locations to the repository the sketch names, with no options', () => {
    const sketch = 'get_user(id):    ::src[app/users.py:3-9]\n    ::repo[git+https://github.com/org/shop@a1b2c3d]\n';
    expect(render(fenced('skeudo', sketch))).toContain('href="https://github.com/org/shop/blob/a1b2c3d/app/users.py#L3-L9"');
  });

  test('gives srcHref the sketch and the env passed to render', () => {
    const md = markdownit().use(markdownItSkeudo, {
      srcHref: (loc, sketch, env) => `${env.base}/${sketch.signature?.name}/${loc.path}`,
    });
    expect(md.render(fenced('skeudo', 'get_user(id):    ::src[app/users.py:3]\n'), { base: '/docs' })).toContain('href="/docs/get_user/app/users.py"');
  });

  test('finds the fences of both languages in a document', () => {
    const doc = `${fenced('skeudo', SKETCH)}\n${fenced('sketch', 'f(x):\n')}`;
    expect(sketchFences(markdownit(), doc).map((f) => f.content)).toEqual([SKETCH, 'f(x):\n']);
  });
});
