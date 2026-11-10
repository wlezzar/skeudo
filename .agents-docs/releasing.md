# Building and releasing

How the published packages are built, and how to check them the way a user installs them. The plan for the first release, with what is left and who does it, is `.tasks/002-publishing/plan.md`.

## What gets published

Five npm packages share one version: `@skeudo/core`, `@skeudo/html`, `markdown-it-skeudo`, `remark-skeudo` and the `skeudo` CLI. Their `package.json` files say what goes in (`files`) and what the published `exports` are (`publishConfig`). The playground, the VS Code extension and the repository root are `"private": true`.

## The build

- **Libraries**: `pnpm build:packages`, or `pnpm build` in one package, runs `scripts/build-library.mts`. It empties `dist/`, runs `tsc -b tsconfig.build.json` (project references, so a library builds the ones it imports first), writes each stylesheet `publishConfig.exports` names, inlined into one file, and copies the root `LICENSE` in.
- **The CLI**: `pnpm build:cli` bundles `apps/cli/dist/skeudo.js` with esbuild and copies the `LICENSE`.
- **`prepack`** runs the build, so `pnpm pack` and `pnpm publish` never pack a stale `dist/`.
- **`publishConfig`** replaces `exports` (and adds `types`) when pnpm packs, so the published package points at `dist/` while the repository points at `src/`. Only pnpm does this, and only pnpm turns `workspace:*` into the version, so always publish with `pnpm publish`, never `npm publish`.
- **Declarations keep `.ts` in their imports** (`export … from './code/render.ts'`), since tsc rewrites extensions only in JavaScript. TypeScript 5.6 and 7 both resolve them, under `nodenext`, `node16` and `bundler`, with `skipLibCheck` off. (Checked 2026-11-10.)
- **`@skeudo/html`'s types name `HTMLElement`** (in `enhance`), so a project with neither the `dom` lib nor `skipLibCheck` gets errors from them. The common tsconfig bases set `skipLibCheck`.

## Checking the packed packages

Pack all five into a scratch folder, then install them in scratch projects, outside the repository:

```sh
pnpm --filter './packages/*' --filter skeudo pack --pack-destination "$S/tarballs"
tar tzf "$S/tarballs/skeudo-html-0.1.0.tgz"                         # dist, LICENSE, README, package.json
tar xzf "$S/tarballs/markdown-it-skeudo-0.1.0.tgz" -O package/package.json   # exports point at dist/
```

- **npm** installs local tarballs together: `npm i $S/tarballs/*.tgz markdown-it unified remark-parse remark-rehype rehype-stringify`. npm finds `@skeudo/core@0.1.0` among them instead of fetching it.
- **pnpm** needs `overrides` in the scratch project's `pnpm-workspace.yaml`, pointing `@skeudo/core` and `@skeudo/html` at their tarballs, or it looks for them on the registry. Its strict `node_modules` catches a missing dependency.
- Check: an ESM script imports each package and renders a sketch, `require.resolve('@skeudo/html/skeudo.css')` finds the stylesheet, `npx skeudo check` runs, and a `.ts` file importing every package's types passes `tsc --noEmit` under `nodenext` and `bundler`.

## Docs sites

The Markdown plugins were checked in real sites on 2026-11-10: VitePress 1.6 for markdown-it-skeudo, Docusaurus 3.10 for remark-skeudo. The setups that worked are in `packages/markdown-it/README.md` and `packages/remark/README.md`. To check again, make each site in a scratch folder from the packed tarballs, build it, serve the build, and look with agent-browser ([visual-checks.md](visual-checks.md)): a code sketch, a data sketch, `::doc`, an inline tag, a second page reached by a link (a single-page app swaps pages without reloading), and dark mode.

What each site did to sketches before it was fixed:

- **VitePress compiles Markdown pages as Vue templates**, and Vue drops whitespace-only text, even with `whitespace: 'preserve'` or `v-pre`. A code line's indentation is therefore a `span.sk-ind` with a width, not bare spaces.
- **Docusaurus renders every `code` element** through its code block component, MDX included. Inline tag pills are therefore a `span.sk-inline`.
- **Docusaurus stripes tables** (`table thead, table tr:nth-child(2n)`). `data.css` resets the data view's tables.
- **A single-page app reuses positions.** `enhance()` remembers each data sketch's step by its position, for VS Code's preview, which renders the page again on each edit. It forgets them when the address changes.
- **Dark mode**: sketches follow `data-theme` on `html`, which Docusaurus sets, or else the system. VitePress only adds a `dark` class, so sketches there don't follow its switch (seen 2026-11-10; [issue #1](https://github.com/wlezzar/skeudo/issues/1)).

Traps:

- **`vitepress preview` lists the files once**, when it starts. After a rebuild, the new chunks are 404s and the page silently loses its scripts. Restart it after each build.
- **The browser caches a site's page between builds.** Add a query (`?v=2`) or reopen agent-browser, then check which chunk loaded: `performance.getEntriesByType('resource')`.
