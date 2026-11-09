/// <reference types="node" />
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import markdownit from 'markdown-it';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { parseCode } from '@skeudo/core';
import { build, previewCss } from '../build.mjs';
import { activate } from '../src/extension';
import { Git } from '../src/git';
import { markdownInjection, sketchGrammar } from '../src/grammars';
import { createSrcHref, workspaceHref, type LinkContext } from '../src/links';
import manifest from '../package.json';

/** A stand-in for the parts of the `vscode` API the extension uses. */
const vscode = vi.hoisted(() => {
  type Listener = (e: { affectsConfiguration(section: string): boolean }) => void;
  const state = { settings: {} as Record<string, unknown>, listeners: [] as Listener[], folders: [] as string[], trusted: true };
  const noop = () => ({ dispose() {} });
  return {
    state,
    changeSetting(key: string, value: unknown) {
      state.settings[key] = value;
      const section = key.split('.')[0];
      for (const l of state.listeners) l({ affectsConfiguration: (s) => s === section || s === key });
    },
    workspace: {
      getConfiguration: (section: string) => ({ get: (key: string) => state.settings[`${section}.${key}`] }),
      onDidChangeConfiguration: (listener: Listener) => {
        state.listeners.push(listener);
        return { dispose() {} };
      },
      onDidChangeWorkspaceFolders: noop,
      onDidGrantWorkspaceTrust: noop,
      get workspaceFolders() {
        return state.folders.map((fsPath) => ({ uri: { scheme: 'file', fsPath } }));
      },
      get isTrusted() {
        return state.trusted;
      },
    },
    commands: { executeCommand: vi.fn(async () => undefined) },
  };
});
vi.mock('vscode', () => ({ workspace: vscode.workspace, commands: vscode.commands }));

/** A stand-in for the extension's global state. */
function memento(initial: Record<string, unknown> = {}) {
  const data = { ...initial };
  return { get: (key: string) => data[key], update: vi.fn(async (key: string, value: unknown) => void (data[key] = value)) };
}

const DOC = [
  '# Profile',
  '',
  'Reads `::read:redis` first.',
  '',
  '```skeudo',
  'get_profile(user_id):                    ::src[app/profile.py:12-24]',
  '    cached = cache.get(user_id)          ::read:redis ::src[13]',
  '    row = load_user(user_id)             ::read:postgres.users',
  '    ::todo[add a metric]',
  '```',
  '',
  '```python',
  'print("not a sketch")',
  '```',
  '',
].join('\n');

/** Activates the extension and returns a markdown-it instance it extended, as VS Code's preview would. */
function preview(globalState = memento()) {
  const { extendMarkdownIt } = activate({ subscriptions: [], globalState } as never);
  // VS Code's preview tags every block with its source line, for scroll sync.
  const md = markdownit({ html: true, linkify: true });
  md.core.ruler.push('source_map_data_attribute', (state) => {
    for (const t of state.tokens) {
      if (t.map && t.type !== 'inline') {
        t.attrSet('data-line', String(t.map[0]));
        t.attrJoin('class', 'code-line');
      }
    }
  });
  return extendMarkdownIt(md);
}

beforeEach(() => {
  vscode.state.settings = {};
  vscode.state.listeners = [];
  vscode.state.folders = [];
  vscode.state.trusted = true;
  vscode.commands.executeCommand.mockClear();
});

describe('Markdown preview', () => {
  test('renders sketch fences and inline tags, and leaves other code alone', () => {
    const html = preview().render(DOC);
    expect(html).toContain('data-sketch');
    expect(html).toContain('<code class="sk-inline">');
    expect(html).toContain('<pre><code data-line="11" class="code-line language-python">');
  });

  test('renders the sketch fences of documents written before the rename', () => {
    expect(preview().render('```sketch\nget_profile(user_id):\n    ::read:redis\n```\n')).toContain('data-sketch');
  });

  test('keeps the source line on the sketch, so the preview can scroll to it', () => {
    expect(preview().render(DOC)).toMatch(/<div data-line="4" class="code-line"><div class="sketch[^"]*"/);
  });

  test('links ::src locations to files in the workspace, at their lines', () => {
    const html = preview().render(DOC);
    expect(html).toContain('href="/app/profile.py#L12-L24"');
    expect(html).toContain('href="/app/profile.py#L13"');
  });

  test('applies the settings, and refreshes the preview when they change', () => {
    vscode.state.settings['skeudo.labelKinds'] = ['untrusted', 'secret'];
    const md = preview();
    expect(md.render(DOC)).not.toContain('--sk-c:#8b5cf6');

    vscode.changeSetting('skeudo.kindColors', { todo: '#8b5cf6' });
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('markdown.preview.refresh');
    expect(md.render(DOC)).toContain('--sk-c:#8b5cf6');

    vscode.changeSetting('skeudo.labelKinds', ['pii']);
    expect(md.render('```skeudo\nf(x):    ::pii:x\n    g(x)\n```\n')).toContain('sk-lbl-pii');
  });

  test('ignores changes to other settings', () => {
    preview();
    for (const l of vscode.state.listeners) l({ affectsConfiguration: (s) => s === 'editor' });
    expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
  });
});

describe('source links without ::repo', () => {
  test('use the path from the workspace folder, and the line or range', () => {
    expect(workspaceHref({ path: 'app/users.py', start: 88 })).toBe('/app/users.py#L88');
    expect(workspaceHref({ path: './app/users.py', start: 88, end: 88 })).toBe('/app/users.py#L88');
    expect(workspaceHref({ path: 'app/users.py' })).toBe('/app/users.py');
  });

  test('escape characters that mean something in a URL', () => {
    expect(workspaceHref({ path: 'docs/a b#1.md', start: 3 })).toBe('/docs/a%20b%231.md#L3');
  });

  test('are omitted for a location without a file', () => {
    expect(workspaceHref({ start: 13 })).toBeUndefined();
  });
});

describe('source links with ::repo', () => {
  // A repository cloned from GitHub, and a folder of notes outside it, where a sketch of it is saved.
  let root: string;
  let shop: string;
  let notes: string;
  let sha: string;
  const ID = 'github.com/org/shop';
  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], { cwd, encoding: 'utf8' }).trim();

  beforeAll(async () => {
    // Git reports real paths, which differ from the temp folder's on macOS.
    root = await realpath(await mkdtemp(join(tmpdir(), 'skeudo-links-')));
    shop = join(root, 'shop');
    notes = join(root, 'notes');
    await mkdir(join(shop, 'app'), { recursive: true });
    await mkdir(join(shop, 'docs'));
    await mkdir(notes);
    await writeFile(join(shop, 'app', 'profile.py'), 'def get_profile(user_id):\n    return None\n');
    git(shop, 'init', '-q');
    git(shop, 'remote', 'add', 'origin', 'git@github.com:org/shop.git');
    git(shop, 'add', '.');
    git(shop, 'commit', '-qm', 'Add profiles');
    sha = git(shop, 'rev-parse', '--short', 'HEAD');
  });
  afterAll(() => rm(root, { recursive: true, force: true }));

  const LOC = { path: 'app/profile.py', start: 1, end: 2 };
  const context = (over: Partial<LinkContext> = {}): LinkContext => ({
    git: () => new Git(0),
    repositories: () => ({}),
    gitHosts: () => ({}),
    workspaceFolders: () => [],
    remembered: () => ({}),
    ...over,
  });
  const inDocument = (path = join(notes, 'review.md')) => ({ currentDocument: { scheme: 'file', fsPath: path } });
  const href = (ctx: LinkContext, repo: string, env: Record<string, unknown> = inDocument()) =>
    createSrcHref(ctx)(LOC, parseCode(`get_profile(user_id):    ::src[app/profile.py:1-2]\n    ::repo[${repo}]\n`), env);
  const remembered = () => ({ [ID]: shop });

  test('open the local copy, with a path relative to the document', () => {
    expect(href(context({ remembered }), 'git+https://github.com/org/shop')).toBe('../shop/app/profile.py#L1-L2');
  });

  test('find the copy from the setting, the repository holding the document, or the open folders', () => {
    expect(href(context({ repositories: () => ({ 'https://github.com/org/shop.git': shop }) }), 'git+https://github.com/org/shop')).toBe('../shop/app/profile.py#L1-L2');
    expect(href(context({ repositories: () => ({ 'github.com/Org/Shop': shop }) }), 'git+https://github.com/org/shop')).toBe('../shop/app/profile.py#L1-L2');
    expect(href(context(), 'git+https://github.com/org/shop', inDocument(join(shop, 'docs', 'review.md')))).toBe('../app/profile.py#L1-L2');
    expect(href(context({ workspaceFolders: () => [notes, shop] }), 'git+https://github.com/org/shop')).toBe('../shop/app/profile.py#L1-L2');
  });

  test('warn when the file has changed since the revision, or the copy lacks the revision', async () => {
    const ctx = context({ remembered });
    expect(href(ctx, `git+https://github.com/org/shop@${sha}`)).toBe('../shop/app/profile.py#L1-L2');
    await writeFile(join(shop, 'app', 'profile.py'), '# Profiles\ndef get_profile(user_id):\n    return None\n');
    try {
      expect(href(ctx, `git+https://github.com/org/shop@${sha}`)).toEqual({
        href: '../shop/app/profile.py#L1-L2',
        note: `app/profile.py has changed since ${sha}, so the lines may have moved.`,
      });
    } finally {
      git(shop, 'checkout', '--', 'app/profile.py');
    }
    expect(href(ctx, 'git+https://github.com/org/shop@0000000')).toEqual({
      href: '../shop/app/profile.py#L1-L2',
      note: `${shop} doesn't have 0000000, so the lines may have moved.`,
    });
  });

  test('never pass a revision to git that it would read as an option', () => {
    expect(href(context({ remembered }), 'git+https://github.com/org/shop@--output=x')).toBe('../shop/app/profile.py#L1-L2');
  });

  test('link to the host when there is no local copy, or no document on disk', () => {
    const web = `https://github.com/org/shop/blob/${sha}/app/profile.py#L1-L2`;
    expect(href(context(), `git+https://github.com/org/shop@${sha}`)).toBe(web);
    expect(href(context({ remembered }), `git+https://github.com/org/shop@${sha}`, {})).toBe(web);
    expect(href(context(), 'git+https://git.example.com/org/shop')).toBeUndefined();
    expect(href(context({ gitHosts: () => ({ 'git.example.com': 'gitlab' }) }), 'git+https://git.example.com/org/shop')).toBe(
      'https://git.example.com/org/shop/-/blob/HEAD/app/profile.py#L1-2',
    );
  });

  test('open a git+file folder or a file: base from the document, and leave a missing folder unlinked', () => {
    const url = pathToFileURL(shop).href;
    expect(href(context(), `git+${url}@${sha}`)).toBe('../shop/app/profile.py#L1-L2');
    expect(href(context(), url)).toBe('../shop/app/profile.py#L1-L2');
    expect(href(context(), 'git+file:///nowhere/shop')).toBeUndefined();
    expect(href(context(), 'https://code.example.com/shop/blob/a1b2c3d')).toBe('https://code.example.com/shop/blob/a1b2c3d/app/profile.py#L1-L2');
  });

  test('run no git in an untrusted workspace', async () => {
    const untrusted = context({ git: () => undefined, workspaceFolders: () => [shop] });
    expect(href(untrusted, 'git+https://github.com/org/shop')).toBe('https://github.com/org/shop/blob/HEAD/app/profile.py#L1-L2');
    expect(href({ ...untrusted, remembered }, 'git+https://github.com/org/shop@0000000')).toBe('../shop/app/profile.py#L1-L2');
  });

  test('work in the preview, which remembers the repositories open in the window', async () => {
    vscode.state.folders = [shop];
    const state = memento();
    const md = preview(state);
    await vi.waitFor(() => expect(state.update).toHaveBeenCalledWith('repositories', { [ID]: shop }));

    vscode.state.folders = [notes];
    const doc = '```skeudo\nget_profile(user_id):    ::src[app/profile.py:1-2]\n    ::repo[git+https://github.com/org/shop]\n```\n';
    expect(md.render(doc, inDocument())).toContain('href="../shop/app/profile.py#L1-L2"');
  });
});

describe('language configuration', () => {
  const config = JSON.parse(readFileSync(new URL('../language-configuration.json', import.meta.url), 'utf8'));
  const indents = (line: string) => new RegExp(config.onEnterRules[0].beforeText).test(line);

  test('indents after a block header, even one with trailing tags', () => {
    expect(indents('get_profile(user_id):')).toBe(true);
    expect(indents('    if that fails:                    ::new ::changed[was a retry]')).toBe(true);
    expect(indents('    else:   ::src[16-23]')).toBe(true);
  });

  test('does not indent after other lines, even ones whose tags hold colons', () => {
    expect(indents('    cache.set(key)    ::write:redis[5 min ttl]')).toBe(false);
    expect(indents('    ::src:load_user[app/users.py:88]')).toBe(false);
    expect(indents('    if a: do b')).toBe(false);
  });
});

describe('build', () => {
  let out: string;
  beforeAll(async () => {
    out = await mkdtemp(join(tmpdir(), 'skeudo-vscode-'));
    await build(out);
  });
  afterAll(() => rm(out, { recursive: true, force: true }));

  test('writes every file the manifest points to', async () => {
    const contributed = [
      manifest.main,
      ...manifest.contributes['markdown.previewStyles'],
      ...manifest.contributes['markdown.previewScripts'],
      ...manifest.contributes.grammars.map((g) => g.path),
    ];
    for (const path of contributed) {
      expect(manifest.files).toContain(path.replace(/^\.\//, ''));
      await expect(readFile(join(out, path.replace(/^\.\/dist\//, '')), 'utf8')).resolves.not.toBe('');
    }
    for (const { configuration } of manifest.contributes.languages) {
      expect(manifest.files).toContain(configuration.replace(/^\.\//, ''));
      JSON.parse(await readFile(new URL(`../${configuration}`, import.meta.url), 'utf8'));
    }
  });

  test('writes grammars under the scope names the manifest gives them', async () => {
    for (const { path, scopeName } of manifest.contributes.grammars) {
      expect(JSON.parse(await readFile(join(out, path.replace(/^\.\/dist\//, '')), 'utf8')).scopeName).toBe(scopeName);
    }
    // Fences embed the language's grammar, in the scope the manifest maps to the language.
    const fence = manifest.contributes.grammars.find((g) => 'injectTo' in g)!;
    const embedded = JSON.stringify(markdownInjection);
    expect(embedded).toContain(`"include":"${sketchGrammar.scopeName}"`);
    expect(Object.keys(fence.embeddedLanguages!).map((scope) => embedded.includes(`"contentName":"${scope}"`))).toEqual([true]);
  });

  test("bundles everything but the vscode module and Node's own modules", async () => {
    const js = await readFile(join(out, 'extension.js'), 'utf8');
    expect([...new Set([...js.matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1]).filter((m) => !m.startsWith('node:')))]).toEqual(['vscode']);
    expect(js).toContain('extendMarkdownIt');
  });

  test("colors sketches for VS Code's light and dark themes", async () => {
    const css = await readFile(join(out, 'skeudo.css'), 'utf8');
    expect(css).toMatch(/:root,\nbody\.vscode-light, body\.vscode-high-contrast-light \{\n  --sk-font/);
    expect(css).toMatch(/:root\[data-theme='dark'\],\nbody\.vscode-dark, [^{]+\{\n  --sk-bg: #171a21/);
  });

  test('fails rather than writing CSS without the theme rules', () => {
    expect(() => previewCss('.sketch { color: red }')).toThrow(/expected one ":root \{"/);
  });
});
