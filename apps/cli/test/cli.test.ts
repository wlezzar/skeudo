/// <reference types="node" />
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { build } from '../build.mjs';
import manifest from '../package.json';

// The tests run the bundled CLI, as it would be installed.
let dir: string;
let bin: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'skeudo-'));
  bin = await build(join(dir, 'dist'));
});
afterAll(() => rm(dir, { recursive: true, force: true }));

function skeudo(args: string[], input = '') {
  const run = spawnSync(process.execPath, [bin, ...args], { cwd: dir, input, encoding: 'utf8' });
  return { code: run.status, stdout: run.stdout, stderr: run.stderr };
}

async function files(tree: Record<string, string>) {
  for (const [path, content] of Object.entries(tree)) {
    await mkdir(join(dir, dirname(path)), { recursive: true });
    await writeFile(join(dir, path), content);
  }
}

const lines = (...l: string[]) => l.join('\n') + '\n';

const DOC = lines(
  '---',
  'title: Refunds',
  'srcBase: https://github.com/org/shop/blob/a1b2c3d/',
  '---',
  '# Cancel an order',
  '',
  'Reads `::read:postgres.orders` first.',
  '',
  '```sketch',
  'cancel_order(order_id):                  ::src[shop/orders.py:40-60]',
  '    order = load_order(order_id)         ::read:postgres.orders ::src[42]',
  '    refund(order.payment)                ::write:stripe',
  '    ::fail',
  '```',
  '',
  '```sketch',
  'notify(order):',
  '   send it                              ::write',
  '```',
);

const CLEAN = lines('get_user(id):', '    row = find(id)    ::read:postgres.users', '    return row');

describe('check', () => {
  test('reports warnings at their lines in the document, and exits with 1', async () => {
    await files({ 'doc.md': DOC });
    expect(skeudo(['check', 'doc.md'])).toEqual({
      code: 1,
      stdout: lines(
        'doc.md:13: warning: ::fail needs a name, as in ::fail:NotFound.',
        'doc.md:18: warning: Indent by 2 or 4 spaces per level, not 3.',
        'doc.md:18: warning: ::write needs the system it touches, as in ::write:postgres.',
        'Checked 2 sketches: 3 warnings.',
      ),
      stderr: '',
    });
  });

  test('exits with 0 when there are no warnings', async () => {
    await files({ 'clean.sketch': CLEAN });
    expect(skeudo(['check', 'clean.sketch'])).toEqual({ code: 0, stdout: 'Checked 1 sketch: no warnings.\n', stderr: '' });
  });

  test('says so when there are no sketches', async () => {
    await files({ 'plain.md': '# Notes\n\n```python\nprint(1)\n```\n' });
    expect(skeudo(['check', 'plain.md'])).toMatchObject({ code: 0, stdout: 'No sketches found.\n' });
  });

  test('searches directories for Markdown and .sketch files, skipping hidden folders and node_modules', async () => {
    await files({
      'tree/b.md': '```sketch\nf(x):\n    ::fail\n```\n',
      'tree/a/z.sketch': CLEAN,
      'tree/a/notes.txt': 'f(x):\n    ::fail\n',
      'tree/node_modules/pkg/README.md': '```sketch\nf(x):\n    ::fail\n```\n',
      'tree/.git/x.md': '```sketch\nf(x):\n    ::fail\n```\n',
    });
    expect(skeudo(['check', 'tree'])).toMatchObject({
      code: 1,
      stdout: lines(`${join('tree', 'b.md')}:3: warning: ::fail needs a name, as in ::fail:NotFound.`, 'Checked 2 sketches in 2 files: 1 warning.'),
    });
  });

  test('checks a named file whatever its extension, as Markdown when it has a sketch fence', async () => {
    await files({ 'pr.txt': 'Summary\n\n~~~sketch\nf(x):\n    ::fail\n~~~\n', 'raw.txt': 'f(x):\n    ::fail\n' });
    expect(skeudo(['check', 'pr.txt', 'raw.txt']).stdout).toBe(
      lines(
        'pr.txt:5: warning: ::fail needs a name, as in ::fail:NotFound.',
        'raw.txt:2: warning: ::fail needs a name, as in ::fail:NotFound.',
        'Checked 2 sketches in 2 files: 2 warnings.',
      ),
    );
  });

  test('reads stdin with no path or with -', () => {
    const sketch = 'f(x):\n    ::read\n';
    const expected = lines('<stdin>:2: warning: ::read needs the system it touches, as in ::read:postgres.', 'Checked 1 sketch: 1 warning.');
    expect(skeudo(['check'], sketch).stdout).toBe(expected);
    expect(skeudo(['check', '-'], sketch).stdout).toBe(expected);
    expect(skeudo(['check'], DOC).stdout).toContain('<stdin>:13: warning: ::fail needs a name');
    expect(skeudo(['check'], '').stdout).toBe('No sketches found.\n');
  });
});

describe('render', () => {
  test('writes a standalone page that loads nothing from elsewhere', async () => {
    await files({ 'doc.md': DOC });
    const { code, stdout, stderr } = skeudo(['render', 'doc.md']);
    expect(code).toBe(0);
    expect(stdout).toMatch(/^<!doctype html>\n/);
    expect(stdout).toContain('<title>Refunds</title>');
    expect(stdout).toContain('<div class="sketch sk-gutter"');
    expect(stdout).toContain('<code class="sk-inline">');
    expect(stdout).toContain('--sk-bg:'); // sketch.css
    expect(stdout).toContain('main.bare'); // the page's own styles
    expect(stdout).toMatch(/<script>[^<]*mouseover/);
    expect(stdout).not.toMatch(/<link|<script src|@import|url\(/);
    // The front matter isn't shown.
    expect(stdout).not.toContain('srcBase');
    // Warnings go to stderr, so stdout holds only the page.
    expect(stderr).toBe(lines('doc.md:13: warning: ::fail needs a name, as in ::fail:NotFound.', 'doc.md:18: warning: Indent by 2 or 4 spaces per level, not 3.', 'doc.md:18: warning: ::write needs the system it touches, as in ::write:postgres.'));
  });

  test('links ::src locations under srcBase from the front matter, or --src-base', async () => {
    await files({ 'doc.md': DOC });
    const hrefs = (out: string) => [...new Set(out.match(/href="[^"]*"/g))];
    expect(hrefs(skeudo(['render', 'doc.md']).stdout)).toEqual([
      'href="https://github.com/org/shop/blob/a1b2c3d/shop/orders.py#L40-L60"',
      'href="https://github.com/org/shop/blob/a1b2c3d/shop/orders.py#L42"',
    ]);
    expect(hrefs(skeudo(['render', 'doc.md', '--src-base', 'https://example.com/src']).stdout)).toEqual([
      'href="https://example.com/src/shop/orders.py#L40-L60"',
      'href="https://example.com/src/shop/orders.py#L42"',
    ]);
  });

  test('titles the page by front matter, then the first heading, the signature and the file name', async () => {
    const title = (args: string[], input = '') => /<title>(.*)<\/title>/.exec(skeudo(args, input).stdout)?.[1];
    await files({ 'cancel.md': DOC.replace('title: Refunds\n', ''), 'flow.sketch': 'Every night:\n    purge old rows    ::write:postgres\n' });
    expect(title(['render', 'cancel.md'])).toBe('Cancel an order');
    expect(title(['render'], '# Use `get_user` & <more>\n\n```sketch\nf(x):\n```\n')).toBe('Use get_user &amp; &lt;more&gt;');
    expect(title(['render'], CLEAN)).toBe('get_user');
    expect(title(['render', 'flow.sketch'])).toBe('flow');
    expect(title(['render'], 'Every night:\n    purge    ::write:postgres\n')).toBe('Sketch');
  });

  test('renders a sketch on its own', () => {
    const { stdout } = skeudo(['render'], CLEAN);
    expect(stdout).toContain('<main class="bare"><div class="sketch"');
    expect(stdout).toContain('<span class="sk-fn">get_user</span>');
  });

  test('writes to a file with -o', async () => {
    await files({ 'clean.sketch': CLEAN });
    expect(skeudo(['render', 'clean.sketch', '-o', 'out.html'])).toEqual({ code: 0, stdout: '', stderr: '' });
    expect(await readFile(join(dir, 'out.html'), 'utf8')).toBe(skeudo(['render', 'clean.sketch']).stdout);
  });
});

describe('usage', () => {
  test('prints help and the version', () => {
    expect(skeudo([]).stdout).toMatch(/^skeudo: check and render sketches/);
    expect(skeudo(['--help'])).toEqual(skeudo(['check', '--help']));
    expect(skeudo(['--version']).stdout).toBe(`${manifest.version}\n`);
  });

  test.each([
    [['frob'], 'unknown command: frob'],
    [['check', '--frob'], "Unknown option '--frob'"],
    [['check', 'missing.md'], "can't read missing.md: no such file or directory"],
    [['render', 'missing.md'], "can't read missing.md: no such file or directory"],
    [['render', 'a.md', 'b.md'], 'render takes one file'],
  ])('exits with 2 for %j', (args, message) => {
    const { code, stdout, stderr } = skeudo(args);
    expect(code).toBe(2);
    expect(stdout).toBe('');
    expect(stderr).toContain(`skeudo: ${message}`);
    expect(stderr).toContain('Run skeudo --help for usage.');
  });
});
