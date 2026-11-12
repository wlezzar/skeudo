# markdown-it-skeudo

> **Alpha.** The format and this API will change in ways that break existing sketches and code. Until 1.0, breaking changes come in minor versions (0.1 to 0.2), never in patches, and [CHANGELOG.md](https://github.com/wlezzar/skeudo/blob/main/CHANGELOG.md) lists each one.

A [markdown-it](https://github.com/markdown-it/markdown-it) plugin that renders [Skeudo](https://github.com/wlezzar/skeudo) sketches. A sketch is pseudocode for code review where every outside effect is tagged, or a data model drawn as tables and a story of how their rows change, and its first line says which: `view: code` or `view: data`. The format is defined in [spec/spec.md](https://github.com/wlezzar/skeudo/blob/main/spec/spec.md).

- Every ` ```skeudo ` fence becomes a sketch (` ```sketch ` works too).
- Inline code made only of tags, such as `` `::read:postgres.users` ``, becomes pills.

```sh
npm install markdown-it-skeudo
```

## Use

```js
import MarkdownIt from 'markdown-it';
import markdownItSkeudo from 'markdown-it-skeudo';

const md = new MarkdownIt().use(markdownItSkeudo);
const html = md.render(markdown);
```

The page needs the stylesheet, `@skeudo/html/skeudo.css`, and `enhance()` from `@skeudo/html`, called once in the browser for hovering names, explanations in a popover and stepping through data sketches. [`@skeudo/html`](https://www.npmjs.com/package/@skeudo/html) is installed with the plugin, and its README says what each one does.

### VitePress

Add the plugin in `.vitepress/config.mts`:

```js
import { defineConfig } from 'vitepress';
import markdownItSkeudo from 'markdown-it-skeudo';

export default defineConfig({
  markdown: {
    config: (md) => {
      md.use(markdownItSkeudo);
    },
  },
});
```

Load the stylesheet and `enhance()` in `.vitepress/theme/index.ts`:

```js
import DefaultTheme from 'vitepress/theme';
import { enhance } from '@skeudo/html';
import '@skeudo/html/skeudo.css';

export default {
  extends: DefaultTheme,
  enhanceApp() {
    if (typeof document !== 'undefined') enhance(document);
  },
};
```

Checked with VitePress 1.6.

## Options

| Option | Default | |
| --- | --- | --- |
| `langs` | `['skeudo', 'sketch']` | Fence languages rendered as sketches. |
| `inlineTags` | `true` | Render inline code made only of tags as pills. |
| `srcHref` | links to `::repo` | Builds a link for a `::src` location, from `{ path, start, end }`, the parsed sketch, and the `env` given to `md.render`. `srcBaseHref(base)` from `@skeudo/html` builds one for a base URL, such as `https://github.com/org/repo/blob/a1b2c3d/`. Without it, a sketch that names its repository with `::repo` links to the file there, on GitHub, GitLab or Bitbucket, and other locations are tooltips. |
| `gitHosts` | `{}` | Other GitHub, GitLab or Bitbucket servers, such as `{ 'git.example.com': 'gitlab' }`, so `::repo` links reach them too. |
| `kindColors` | `{}` | CSS colors for tag kinds, such as `{ todo: '#8b5cf6' }`. |
| `labelKinds` | `['untrusted', 'secret']` | Tag kinds whose value labels a variable. Every later use of a labeled variable is marked. |

## Other exports

- `FENCE_LANGS`: the default fence languages.
- `sketchFences(md, source)`: the sketch fences in a Markdown document, each with its content and the line it starts on, for tools that check sketches.
- `frontMatter(source)`: splits simple `key: value` front matter from a document.

## License

MIT
