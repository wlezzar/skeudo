# @skeudo/html

> **Alpha.** The format and this API will change in ways that break existing sketches and code. Until 1.0, breaking changes come in minor versions (0.1 to 0.2), never in patches, and [CHANGELOG.md](https://github.com/wlezzar/skeudo/blob/main/CHANGELOG.md) lists each one.

Renders [Skeudo](https://github.com/wlezzar/skeudo) sketches as HTML. A sketch is pseudocode for code review where every outside effect is tagged, or, when it starts with a `data` line, a data model drawn as tables and a story of how their rows change. The format is defined in [spec/spec.md](https://github.com/wlezzar/skeudo/blob/main/spec/spec.md).

For Markdown, use [`markdown-it-skeudo`](https://www.npmjs.com/package/markdown-it-skeudo) or [`remark-skeudo`](https://www.npmjs.com/package/remark-skeudo), which call this package. To render whole pages from the command line, use the [`skeudo`](https://www.npmjs.com/package/skeudo) CLI.

```sh
npm install @skeudo/html
```

## Use

```js
import { toHtml } from '@skeudo/html';

const html = toHtml(`get_user(id):
    row = find(id)    ::read:postgres.users
    return row
`);
```

`toHtml` takes a sketch's source text or a sketch parsed by [`@skeudo/core`](https://www.npmjs.com/package/@skeudo/core), and returns one element: `div.sketch` for a code sketch, `div.skd` for a data sketch. `toHast` returns the same element as a [hast](https://github.com/syntax-tree/hast) tree, for unified pipelines and MDX. Neither touches the DOM, so both run in Node and in the browser.

The page needs two more things:

- **The stylesheet**, `@skeudo/html/skeudo.css`. Import it from a bundler (`import '@skeudo/html/skeudo.css'`), or copy `node_modules/@skeudo/html/dist/skeudo.css` next to your page.
- **`enhance()`**, called once in the browser. It wires the interaction: hovering a name highlights its other uses and clicking pins them, explanations from `::doc` show in a popover, and data sketches step through their story by click or with the arrow keys. It watches the page, so sketches added later, as when a single-page site changes page, work too. Without it, explanations are the browser's tooltips and a data sketch shows its last step.

```js
import { enhance } from '@skeudo/html';

enhance(document); // returns a function that removes its listeners
```

Sketches follow the reader's light or dark mode. A page with a theme switch sets `data-theme="light"` or `data-theme="dark"` on its `html` element, as Docusaurus and Starlight do.

## Options

`toHtml(source, options)` and `toHast(source, options)` take:

| Option | Default | |
| --- | --- | --- |
| `srcHref` | links to `::repo` | Builds a link for a `::src` location, from `{ path, start, end }` and the parsed sketch. `srcBaseHref(base)` builds one for a base URL, such as `https://github.com/org/repo/blob/a1b2c3d/`. Without it, a sketch that names its repository with `::repo` links to the file there, on GitHub, GitLab or Bitbucket, and other locations are tooltips. |
| `gitHosts` | `{}` | Other GitHub, GitLab or Bitbucket servers, such as `{ 'git.example.com': 'gitlab' }`, so `::repo` links reach them too. |
| `kindColors` | `{}` | CSS colors for tag kinds, such as `{ todo: '#8b5cf6' }`. |
| `labelKinds` | `['untrusted', 'secret']` | Tag kinds whose value labels a variable. Every later use of a labeled variable is marked. |

The data view takes no options.

## Other exports

- `tagHtml(tag, options)` and `tagHast(tag, options)` render one tag as a pill, as the Markdown plugins do for inline code such as `` `::read:postgres.users` ``.
- `repoHref(repo, location, gitHosts)` is the default link for a `::src` location in a sketch with `::repo`.
- `escapeHtml(text)`.

## License

MIT
