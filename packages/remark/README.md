# remark-skeudo

> **Alpha.** The format and this API will change in ways that break existing sketches and code. Until 1.0, breaking changes come in minor versions (0.1 to 0.2), never in patches, and [CHANGELOG.md](https://github.com/wlezzar/skeudo/blob/main/CHANGELOG.md) lists each one.

A [remark](https://github.com/remarkjs/remark) plugin that renders [Skeudo](https://github.com/wlezzar/skeudo) sketches in Markdown and MDX. A sketch is pseudocode for code review where every outside effect is tagged, or a data model drawn as tables and a story of how their rows change, and its first line says which: `view: code` or `view: data`. The format is defined in [spec/spec.md](https://github.com/wlezzar/skeudo/blob/main/spec/spec.md).

- Every ` ```skeudo ` fence becomes a sketch (` ```sketch ` works too).
- Inline code made only of tags, such as `` `::read:postgres.users` ``, becomes pills.

The plugin builds the sketch as an HTML syntax tree (hast), not as an HTML string. MDX and the site generators built on remark use it as they would any other element, and plain unified pipelines need no `allowDangerousHtml` or rehype-raw.

```sh
npm install remark-skeudo
```

## Use

With unified:

```js
import rehypeStringify from 'rehype-stringify';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import remarkSkeudo from 'remark-skeudo';
import { unified } from 'unified';

const file = await unified()
  .use(remarkParse)
  .use(remarkSkeudo)
  .use(remarkRehype)
  .use(rehypeStringify)
  .process(markdown);
```

With MDX:

```js
import { compile } from '@mdx-js/mdx';
import remarkSkeudo from 'remark-skeudo';

const js = await compile(mdx, { remarkPlugins: [remarkSkeudo] });
```

Site generators built on remark take it in their list of remark plugins, such as `markdown.remarkPlugins` in Astro. To pass options, give the plugin and its options as a pair: `[remarkSkeudo, { inlineTags: false }]`.

The page needs the stylesheet, `@skeudo/html/skeudo.css`, and `enhance()` from `@skeudo/html`, called once in the browser for hovering names, explanations in a popover and stepping through data sketches. [`@skeudo/html`](https://www.npmjs.com/package/@skeudo/html) is installed with the plugin, and its README says what each one does.

### Docusaurus

Add the plugin to the docs preset, and a client module, in `docusaurus.config.mjs`:

```js
import remarkSkeudo from 'remark-skeudo';

export default {
  // ...
  presets: [['classic', { docs: { remarkPlugins: [remarkSkeudo] } }]],
  clientModules: ['./src/skeudo.js'],
};
```

The client module, `src/skeudo.js`, loads the stylesheet and calls `enhance()`:

```js
import { enhance } from '@skeudo/html';
import '@skeudo/html/skeudo.css';

if (typeof document !== 'undefined') enhance(document);
```

Sketches follow the site's light and dark mode. Checked with Docusaurus 3.10, in `.md` and `.mdx` pages.

## Options

| Option | Default | |
| --- | --- | --- |
| `langs` | `['skeudo', 'sketch']` | Fence languages rendered as sketches. |
| `inlineTags` | `true` | Render inline code made only of tags as pills. |
| `srcHref` | links to `::repo` | Builds a link for a `::src` location, from `{ path, start, end }` and the parsed sketch. `srcBaseHref(base)` from `@skeudo/html` builds one for a base URL, such as `https://github.com/org/repo/blob/a1b2c3d/`. Without it, a sketch that names its repository with `::repo` links to the file there, on GitHub, GitLab or Bitbucket, and other locations are tooltips. |
| `gitHosts` | `{}` | Other GitHub, GitLab or Bitbucket servers, such as `{ 'git.example.com': 'gitlab' }`, so `::repo` links reach them too. |
| `kindColors` | `{}` | CSS colors for tag kinds, such as `{ todo: '#8b5cf6' }`. |
| `labelKinds` | `['untrusted', 'secret']` | Tag kinds whose value labels a variable. Every later use of a labeled variable is marked. |

## Warnings

The parser's warnings, listed under Warnings in the spec, are reported as messages on the file, at their line in the document, with the source `remark-skeudo` and the rule `parse`. remark-cli prints them, and `file.messages` holds them in code.

## In the syntax tree

Each sketch fence is replaced by a `skeudo` node that keeps the fence's `lang`, `meta` and source `value`, and carries the rendered element (`div.sketch`, or `div.skd` for a data sketch) in `data` for remark-rehype. TypeScript users get the node type from the plugin, as `Skeudo`. remark-stringify can't write a `skeudo` node back to Markdown, so use the plugin when the output is HTML or MDX.
