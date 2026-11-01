/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import markdownit from 'markdown-it';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { build, previewCss } from '../build.mjs';
import { activate } from '../src/extension';
import { markdownInjection, sketchGrammar } from '../src/grammar';
import { srcHref } from '../src/links';
import manifest from '../package.json';

/** A stand-in for the parts of the `vscode` API the extension uses. */
const vscode = vi.hoisted(() => {
  type Listener = (e: { affectsConfiguration(section: string): boolean }) => void;
  const state = { settings: {} as Record<string, unknown>, listeners: [] as Listener[] };
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
    },
    commands: { executeCommand: vi.fn(async () => undefined) },
  };
});
vi.mock('vscode', () => ({ workspace: vscode.workspace, commands: vscode.commands }));

const DOC = [
  '# Profile',
  '',
  'Reads `::read:redis` first.',
  '',
  '```sketch',
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
function preview() {
  const { extendMarkdownIt } = activate({ subscriptions: [] } as never);
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
  vscode.commands.executeCommand.mockClear();
});

describe('Markdown preview', () => {
  test('renders sketch fences and inline tags, and leaves other code alone', () => {
    const html = preview().render(DOC);
    expect(html).toContain('data-sketch');
    expect(html).toContain('<code class="sk-inline">');
    expect(html).toContain('<pre><code data-line="11" class="code-line language-python">');
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
    vscode.state.settings['sketch.labelKinds'] = ['untrusted', 'secret'];
    const md = preview();
    expect(md.render(DOC)).not.toContain('--sk-c:#8b5cf6');

    vscode.changeSetting('sketch.kindColors', { todo: '#8b5cf6' });
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('markdown.preview.refresh');
    expect(md.render(DOC)).toContain('--sk-c:#8b5cf6');

    vscode.changeSetting('sketch.labelKinds', ['pii']);
    expect(md.render('```sketch\nf(x):    ::pii:x\n    g(x)\n```\n')).toContain('sk-lbl-pii');
  });

  test('ignores changes to other settings', () => {
    preview();
    for (const l of vscode.state.listeners) l({ affectsConfiguration: (s) => s === 'editor' });
    expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
  });
});

describe('source links', () => {
  test('use the path from the workspace folder, and the line or range', () => {
    expect(srcHref({ path: 'app/users.py', start: 88 })).toBe('/app/users.py#L88');
    expect(srcHref({ path: './app/users.py', start: 88, end: 88 })).toBe('/app/users.py#L88');
    expect(srcHref({ path: 'app/users.py' })).toBe('/app/users.py');
  });

  test('escape characters that mean something in a URL', () => {
    expect(srcHref({ path: 'docs/a b#1.md', start: 3 })).toBe('/docs/a%20b%231.md#L3');
  });

  test('are omitted for a location without a file', () => {
    expect(srcHref({ start: 13 })).toBeUndefined();
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
    out = await mkdtemp(join(tmpdir(), 'sketch-vscode-'));
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

  test('bundles everything but the vscode module', async () => {
    const js = await readFile(join(out, 'extension.js'), 'utf8');
    expect([...js.matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1])).toEqual(['vscode']);
    expect(js).toContain('extendMarkdownIt');
  });

  test("colors sketches for VS Code's light and dark themes", async () => {
    const css = await readFile(join(out, 'sketch.css'), 'utf8');
    expect(css).toMatch(/:root,\nbody\.vscode-light, body\.vscode-high-contrast-light \{\n  --sk-font/);
    expect(css).toMatch(/:root\[data-theme='dark'\],\nbody\.vscode-dark, [^{]+\{\n  --sk-bg: #171a21/);
  });

  test('fails rather than writing CSS without the theme rules', () => {
    expect(() => previewCss('.sketch { color: red }')).toThrow(/expected one ":root \{"/);
  });
});
