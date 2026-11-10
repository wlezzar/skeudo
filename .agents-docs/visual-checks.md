# Checking renders

Tests check the markup, not how it looks. For a change to CSS, layout or interaction, look at it in a browser, in light and dark, at a few widths. Past changes were checked at 1280px, 700px and 420px wide, and for data sketches, that no box moves while stepping through the story.

## A page from the CLI

`skeudo render` writes a standalone page with the stylesheet and the script inlined. Build the CLI from the source first; the global `skeudo` may be an older build ([environment.md](environment.md#global-installs-that-go-stale)).

```sh
pnpm build:cli
node apps/cli/dist/skeudo.js render spec/fixtures/data/examples/groups.skeudo -o "$S/page.html"
agent-browser --args "--no-sandbox" open "file://$S/page.html"
agent-browser screenshot "$S/light.png"
agent-browser set media dark
agent-browser set viewport 700 900
agent-browser screenshot "$S/dark-700.png"
agent-browser close
```

`$S` is a scratch folder. Read the PNGs to see them. `set media` and `set viewport` apply to the open page without a reload. To step through a data sketch, `agent-browser click` a step, or click the sketch and `agent-browser press ArrowRight`, then take another screenshot and compare. `agent-browser snapshot` lists the elements with refs to click. (Seen working 2026-11-09.)

`agent-browser eval` runs each script in the same page scope, so a second `const x` fails with "Identifier 'x' has already been declared". Wrap each script in `(() => { … })()`. It is also the quickest way to check that no box moves: click each `li[data-skd-at]` in turn and compare the `getBoundingClientRect()` of every `.skd-table`, `.skd-folder` and `.skd-step`. (Seen 2026-11-09.)

`--no-sandbox` is needed on this machine ([environment.md](environment.md#known-limits)). Use it only for local pages like these, and say that you did.

The fixtures under `spec/fixtures/*/examples/` cover each view's main features. A Markdown file renders every sketch in it on one page.

## The playground

`pnpm dev` serves the site at http://localhost:5173: the landing page (`apps/playground/index.html`, `apps/playground/src/landing.ts`) and, at http://localhost:5173/playground/, the playground: an editor, the preview, a review panel and the AST. `/playground/?example=<id>` opens one of its examples. It keeps running, so start it in the background and stop it when you are done. Its examples are in `apps/playground/src/examples.ts`, plus any Markdown files in `apps/playground/local-examples/`, which is gitignored and may hold private code.

## The VS Code preview

VS Code can't run here ([environment.md](environment.md#known-limits)). What worked instead (2026-10-31): build the extension with `pnpm --filter skeudo-vscode build`, load `apps/vscode/dist/extension.js` in Node with a stand-in `vscode` module, render a Markdown file through the `extendMarkdownIt` that `activate` returns, and open the HTML in agent-browser with a copy of VS Code's preview stylesheet (`extensions/markdown-language-features/media/markdown.css` in the vscode repository) and a `vscode-dark` or `vscode-light` class on `body`. `apps/vscode/test/extension.test.ts` has a stand-in to start from.

On 2026-11-09 a short CommonJS script in the scratchpad did this without Vitest: it replaced `Module._load` so that `require('vscode')` returns the stand-in, called `activate(...).extendMarkdownIt(md)` with the `markdown-it` from `apps/vscode`, and wrote the rendered Markdown into a page with `apps/vscode/dist/skeudo.css` and `apps/vscode/dist/preview.js` inlined. To mimic the preview rendering again on an edit, remove the sketches and insert their markup again: `enhance()` should start them at the frame they showed.

That checks the bundle, the CSS and the theming, not VS Code itself. Tell the user what is left for them to check in the editor, such as links opening files and the highlighting.

## Docs sites

VitePress and Docusaurus sites built from the packed packages: see [releasing.md](releasing.md#docs-sites), which also lists what each site did to sketches.
