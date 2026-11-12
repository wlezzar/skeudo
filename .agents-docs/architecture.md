# Architecture

[README.md](../README.md) has the folder layout. This note says how the parts connect, and the conventions that only show up after reading several files.

## A sketch, from text to page

1. **View.** `parse` in `packages/core/src/views.ts` reads the header, `view: data`, on the first non-blank line (`readHeader` in `packages/core/src/header.ts`). A sketch without a header, or whose first line names no view (`view: dat`), is code, and `parse` adds the warning. Each view's parser skips only its own header line, so `view: dat` stays a visible line, and calling `parseCode` or `parseData` directly gives no header warning.
2. **Parse.** `parse` calls the view's parser. The code view's is `parseCode` in `packages/core/src/code/parse.ts`, with `analyze` (`packages/core/src/code/analyze.ts`) deriving flows and changes for review. The data view's is `parseData` in `packages/core/src/data/parse.ts`, which also replays the story (`replayData` and `checkData` in `packages/core/src/data/replay.ts`). The story plays in frames: one per substep, or one for a step without substeps. `replayData` returns each frame's rows and the rows its reads find. The result is a `Sketch`, a union told apart by `view`, with `diagnostics`.
3. **Never throw.** Problems are warnings attached to a line, and line numbers count the header line, so a half-written sketch still renders.
4. **Render.** `toHast` in `packages/html/src/index.ts` switches on `view` and returns one hast element. `toHtml` serializes it. Rendering never touches the DOM, so it runs in Node, in MDX and in VS Code's preview.
5. **Enhance.** In the browser, `enhance()` in the same file wires both views' interaction. Its listeners sit on the root, so sketches rendered later work too. A page without it is still readable.
6. **Integrations** call `parse`, `toHast` or `toHtml` and never name a view: `packages/markdown-it/src/index.ts`, `packages/remark/src/index.ts`, `apps/cli/src/main.ts`, `apps/vscode/src/extension.ts` and `apps/playground/src/main.ts`.

## Where the views are listed

Each view owns a folder in `spec/fixtures/`, `packages/core/src/`, `packages/html/src/` and `apps/vscode/src/grammars/`, a spec in `spec/`, and a guide in `skills/skeudo/`. Outside those folders, only a few places name a view. This lists them, using the data view's names:

```sh
git grep -nwE "dataView|parseData|DataSketch|dataToHast|enhanceData|dataPatterns|dataRepository|projectData" -- ':!*/data/*' ':!*.md' ':!*.test.ts' ':!*/core/src/index.ts'
```

Add `PROJECTIONS` in `packages/core/test/fixtures.test.ts` to that list.

## Conventions

- **Packages export TypeScript sources** (`"exports": "./src/index.ts"`), so Vitest and Vite read them directly, and the CLI (`apps/cli/build.mts`) and the VS Code extension (`apps/vscode/build.mts`) bundle them with esbuild. Their relative imports end in `.ts`, which lets `tsc -b` emit runnable JavaScript (and JSR will need them). Publishing uses a build instead: see [releasing.md](releasing.md). For plain `node`, see [testing.md](testing.md#running-the-packages-from-a-script).
- **One stylesheet.** `packages/html/src/skeudo.css` imports `shared/base.css` (color tokens and dark mode), `shared/popover.css`, `code/code.css` and `data/data.css`. The builds inline the imports with `scripts/stylesheet.mts`. Don't switch to esbuild's CSS bundler: it rewrites selectors such as `[data-theme='dark']` and drops comments, which breaks `previewCss` in the VS Code build.
- **Class names.** The code view's classes start with `sk-` and its root is `div.sketch`. The data view's start with `skd-` and its root is `div.skd`. Both use the `--sk-*` color tokens.
- **Widths are estimated, not measured.** `packages/html/src/shared/width.ts` estimates text widths in `ch`. A crowded code line gets an `sk-fit-N` class that container queries in `code.css` match. A data table gets fixed column widths from its widest value across every step.
- **Every data frame is in the markup**, one `<tbody>` per frame per table, and `enhance()` only toggles `hidden`. So nothing moves while stepping, and the browser needs no parser. What else shows at some frames only, such as a "no match" badge or a lookup's underlined column name, lists them in `data-skd-on`, and `enhance()` toggles its `skd-on` class. The lines from the story to the rows a read finds are the one thing `enhance()` draws: an SVG over the sketch, drawn again on each frame, on resize and when a table scrolls.
- **The popover** (`packages/html/src/shared/popover.ts`) is shared: `::doc` explanations in code sketches, and table, step and group explanations in data sketches, which can also be pinned. It is fixed on `body`, since `.sketch` scrolls and has container containment, which would clip it.
- **Fences.** `FENCE_LANGS` in `packages/core/src/views.ts` lists the fence languages, `skeudo` and `sketch`.
- **Source links.** `::src` and `::repo` become links in `packages/html/src/code/links.ts`. The VS Code extension finds a local copy of the repository in `apps/vscode/src/links.ts` and `apps/vscode/src/git.ts`. The order each tool tries is in `apps/cli/README.md` and `apps/vscode/README.md`.
- **The VS Code grammar is generated** from TypeScript. `apps/vscode/src/grammars/index.ts` builds `source.skeudo`, picking the view with a rule for each header line, and a Markdown fence injection. The preview renders through markdown-it-skeudo.
- **The CLI page** inlines the stylesheet and a minified browser script (`apps/cli/src/page.ts`) at build time, through the `SKEUDO_CSS` and `SKEUDO_SCRIPT` defines in `apps/cli/build.mts`.
