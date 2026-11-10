import { describe, expect, test } from 'vitest';
import { parseRepo, type Repo } from '@skeudo/core';
import { repoHref, srcBaseHref, toHtml } from '../src/index.ts';

const repo = (url: string) => parseRepo(url) as Repo;
const RANGE = { path: 'app/profile.py', start: 12, end: 24 };
const LINE = { path: 'app/profile.py', start: 13, end: 13 };

const SKETCH = [
  'get_profile(user_id):                    ::src[app/profile.py:12-24]',
  '    cached = cache.get(user_id)          ::read:redis ::src[13]',
  '    row = load_user(user_id)             ::read:postgres.users',
  '    ::src:load_user[app/users.py:88]',
  '    ::repo[git+https://github.com/org/shop@a1b2c3d]',
].join('\n');

const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);

describe('repoHref', () => {
  test('links to the file at the revision on GitHub, GitLab and Bitbucket, in the form each host reads', () => {
    expect(repoHref(repo('git+https://github.com/org/shop@a1b2c3d'), RANGE)).toBe('https://github.com/org/shop/blob/a1b2c3d/app/profile.py#L12-L24');
    expect(repoHref(repo('git+ssh://git@gitlab.com/team/shop.git@v1.2'), RANGE)).toBe('https://gitlab.com/team/shop/-/blob/v1.2/app/profile.py#L12-24');
    expect(repoHref(repo('git+https://bitbucket.org/team/shop@a1b2c3d'), RANGE)).toBe('https://bitbucket.org/team/shop/src/a1b2c3d/app/profile.py#lines-12:24');
    expect(repoHref(repo('git+https://bitbucket.org/team/shop@a1b2c3d'), LINE)).toBe('https://bitbucket.org/team/shop/src/a1b2c3d/app/profile.py#lines-13');
  });

  test('links to the default branch without a revision, and keeps the slashes of a branch', () => {
    expect(repoHref(repo('git+https://github.com/org/shop'), LINE)).toBe('https://github.com/org/shop/blob/HEAD/app/profile.py#L13');
    expect(repoHref(repo('git+https://github.com/org/shop@feature/refunds'), { path: 'a b.py' })).toBe('https://github.com/org/shop/blob/feature/refunds/a%20b.py');
  });

  test('links to other servers only when told what kind they are', () => {
    const own = repo('git+https://git.example.com/team/shop@a1b2c3d');
    expect(repoHref(own, RANGE)).toBeUndefined();
    expect(repoHref(own, RANGE, { 'git.example.com': 'gitlab' })).toBe('https://git.example.com/team/shop/-/blob/a1b2c3d/app/profile.py#L12-24');
  });

  test('links a local folder with a file URL, and adds the path to any other URL', () => {
    expect(repoHref(repo('git+file:///home/me/my%20shop@a1b2c3d'), LINE)).toBe('file:///home/me/my%20shop/app/profile.py#L13');
    expect(repoHref(repo('git+file:///C:/code/shop'), LINE)).toBe('file:///C:/code/shop/app/profile.py#L13');
    expect(repoHref(repo('https://code.example.com/shop/blob/a1b2c3d'), LINE)).toBe('https://code.example.com/shop/blob/a1b2c3d/app/profile.py#L13');
  });

  test('gives nothing for a location without a file', () => {
    expect(repoHref(repo('git+https://github.com/org/shop'), { start: 3 })).toBeUndefined();
  });
});

describe('source links in a rendered sketch', () => {
  test('go to the repository the sketch names, and the ::repo line is hidden', () => {
    const html = toHtml(SKETCH);
    expect(hrefs(html)).toEqual([
      'https://github.com/org/shop/blob/a1b2c3d/app/profile.py#L12-L24',
      'https://github.com/org/shop/blob/a1b2c3d/app/profile.py#L12-L24',
      'https://github.com/org/shop/blob/a1b2c3d/app/profile.py#L13',
      'https://github.com/org/shop/blob/a1b2c3d/app/profile.py#L12-L24',
      'https://github.com/org/shop/blob/a1b2c3d/app/users.py#L88',
    ]);
    expect(html).not.toContain('::repo');
    expect(html).not.toContain('data-line="5"');
  });

  test('hide a ::repo tag that ends a line of code', () => {
    const html = toHtml('f(x):\n    run(x)    ::read:db ::repo[git+https://github.com/org/shop]');
    expect(html).not.toContain('sk-k-repo');
    expect(html).toContain('sk-k-read');
  });

  test('follow srcHref when it is given, which gets the sketch', () => {
    const seen: string[] = [];
    const html = toHtml(SKETCH, {
      srcHref: (loc, sketch) => {
        seen.push(sketch.repo?.type ?? 'none');
        return srcBaseHref('https://example.com/src')(loc);
      },
    });
    expect(hrefs(html)[0]).toBe('https://example.com/src/app/profile.py#L12-L24');
    expect(new Set(seen)).toEqual(new Set(['remote']));
  });

  test('add a link note to the tooltip, and mark the link', () => {
    const html = toHtml(SKETCH, { srcHref: (loc) => ({ href: `/${loc.path}`, note: 'app/profile.py changed since a1b2c3d.' }) });
    expect(html).toContain(
      '<a class="sk-src sk-src-note" href="/app/profile.py" target="_blank" rel="noopener" title="app/profile.py:13\napp/profile.py changed since a1b2c3d.">13</a>',
    );
  });

  test('are tooltips only without a repository or srcHref', () => {
    expect(hrefs(toHtml(SKETCH.split('\n').slice(0, 4).join('\n')))).toEqual([]);
  });
});
