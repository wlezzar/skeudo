# remark-skeudo

A [remark](https://github.com/remarkjs/remark) plugin that renders sketches in Markdown and MDX. A sketch is pseudocode for code review where every outside effect is tagged. The format, Skeudo, is defined in [spec/spec.md](https://github.com/wlezzar/skeudo/blob/main/spec/spec.md).

- Every ` ```skeudo ` fence becomes a sketch (` ```sketch ` works too).
- Inline code made only of tags, such as `` `::read:postgres.users` ``, becomes pills.

The plugin builds the sketch as an HTML syntax tree (hast), not as an HTML string. MDX and the site generators built on remark use it as they would any other element, and plain unified pipelines need no `allowDangerousHtml` or rehype-raw.

remark-skeudo isn't on npm yet. In this repository, packages use it as `"remark-skeudo": "workspace:*"`.

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

Site generators built on remark take it in their list of remark plugins, such as `markdown.remarkPlugins` in Astro or `remarkPlugins` in a Docusaurus docs preset. To pass options, give the plugin and its options as a pair: `[remarkSkeudo, { inlineTags: false }]`.

The page needs the stylesheet, `@skeudo/html/sketch.css`. For variable highlighting (hovering a name highlights its other uses, clicking pins the highlight), call `enhance()` from `@skeudo/html` in the browser once the page has loaded.

## Options

| Option | Default | |
| --- | --- | --- |
| `langs` | `['skeudo', 'sketch']` | Fence languages rendered as sketches. |
| `inlineTags` | `true` | Render inline code made only of tags as pills. |
| `srcHref` | none | Builds a link for a `::src` location, from `{ path, start, end }`. `srcBaseHref(base)` from `@skeudo/html` builds one for a base URL, such as `https://github.com/org/repo/blob/a1b2c3d/`. Without it, locations are tooltips. |
| `kindColors` | `{}` | CSS colors for tag kinds, such as `{ todo: '#8b5cf6' }`. |
| `labelKinds` | `['untrusted', 'secret']` | Tag kinds whose value labels a variable. Every later use of a labeled variable is marked. |

## Warnings

The parser's warnings, listed under Warnings in the spec, are reported as messages on the file, at their line in the document, with the source `remark-skeudo` and the rule `parse`. remark-cli prints them, and `file.messages` holds them in code.

## In the syntax tree

Each sketch fence is replaced by a `skeudo` node that keeps the fence's `lang`, `meta` and source `value`, and carries the rendered `div.sketch` in `data` for remark-rehype. TypeScript users get the node type from the plugin, as `Skeudo`. remark-stringify can't write a `skeudo` node back to Markdown, so use the plugin when the output is HTML or MDX.
