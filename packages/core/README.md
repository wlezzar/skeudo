# @skeudo/core

> **Alpha.** The format and this API will change in ways that break existing sketches and code. Until 1.0, breaking changes come in minor versions (0.1 to 0.2), never in patches, and the [release notes](https://github.com/wlezzar/skeudo/releases) list each one.

The parser for [Skeudo](https://github.com/wlezzar/skeudo), small text formats for explaining code to a reader. A sketch is pseudocode for code review where every outside effect is tagged, or a data model drawn as tables and a story of how their rows change, and its first line says which: `view: code` or `view: data`. The format is defined in [spec/spec.md](https://github.com/wlezzar/skeudo/blob/main/spec/spec.md).

Most people want a renderer instead: [`@skeudo/html`](https://www.npmjs.com/package/@skeudo/html), [`markdown-it-skeudo`](https://www.npmjs.com/package/markdown-it-skeudo), [`remark-skeudo`](https://www.npmjs.com/package/remark-skeudo) or the [`skeudo`](https://www.npmjs.com/package/skeudo) CLI. Use this package to read sketches in your own tools.

```sh
npm install @skeudo/core
```

## Use

```js
import { parse } from '@skeudo/core';

const sketch = parse(`view: code
get_user(id):
    row = find(id)    ::read:postgres.users
    return row
`);

sketch.view;        // 'code', or 'data' for a sketch whose first line is `view: data`
sketch.diagnostics; // [{ line, severity, message }], the warnings listed in the spec
```

`parse` never throws. A problem becomes a warning on its line, and line numbers count from the sketch's first line. The result is a `Sketch`, a union told apart by `view`:

- A `CodeSketch` has its `lines`, each with its code segments and tags, the `variables` it defines and uses, its `signature`, and the repository it names with `::repo`. `analyze(sketch)` lists what a reviewer looks at: the effects, the systems each one touches, failures and the flows of labeled values.
- A `DataSketch` has its `tables` (and folders), `groups` and story `steps`. `replayData(sketch)` plays the story and returns the rows at each frame, and the rows each read finds.

The exported TypeScript types describe every field.

## Options

| Option | Default | |
| --- | --- | --- |
| `labelKinds` | `['untrusted', 'secret']` | Tag kinds whose value labels a variable, as `::untrusted:body` labels `body`. Every later use of a labeled variable is marked. |

## Other exports

- `FENCE_LANGS`: the Markdown fence languages that hold a sketch, `skeudo` and `sketch`.
- `parseTagsOnly(text)`: the tags in a string made only of tags, such as `::read:postgres.users`, or undefined. The Markdown plugins use it for inline code.
- `parseRepo(url)` and `repoId(repo)`: the `::repo` forms.

## License

MIT
