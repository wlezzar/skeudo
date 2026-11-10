# Building and releasing

How the published packages are built, released, and checked the way a user installs them, and how the site is deployed. The publishing plan, with its later stages, is `.tasks/002-publishing/plan.md`.

## What gets published

Five npm packages share one version: `@skeudo/core`, `@skeudo/html`, `markdown-it-skeudo`, `remark-skeudo` and the `skeudo` CLI. Their `package.json` files say what goes in (`files`) and what the published `exports` are (`publishConfig`). The playground, the VS Code extension and the repository root are `"private": true`.

## The build

- **Libraries**: `pnpm build:packages`, or `pnpm build` in one package, runs `scripts/build-library.mts`. It empties `dist/`, runs `tsc -b tsconfig.build.json` (project references, so a library builds the ones it imports first), writes each stylesheet `publishConfig.exports` names, inlined into one file, and copies the root `LICENSE` in.
- **The CLI**: `pnpm build:cli` bundles `apps/cli/dist/skeudo.js` with esbuild and copies the `LICENSE`.
- **`prepack`** runs the build, so `pnpm pack` and `pnpm publish` never pack a stale `dist/`.
- **`publishConfig`** replaces `exports` (and adds `types`) when pnpm packs, so the published package points at `dist/` while the repository points at `src/`. Only pnpm does this, and only pnpm turns `workspace:*` into the version, so always publish with `pnpm publish`, never `npm publish`.
- **Declarations keep `.ts` in their imports** (`export … from './code/render.ts'`), since tsc rewrites extensions only in JavaScript. TypeScript 5.6 and 7 both resolve them, under `nodenext`, `node16` and `bundler`, with `skipLibCheck` off. (Checked 2026-11-10.)
- **`@skeudo/html`'s types name `HTMLElement`** (in `enhance`), so a project with neither the `dom` lib nor `skipLibCheck` gets errors from them. The common tsconfig bases set `skipLibCheck`.

## Releasing a version

How 0.1.0 went out, on 2026-11-10. `CHANGELOG.md` says when a change needs a minor version and when a patch.

1. Set the same `version` in the five published `package.json` files (`grep -n '"version"' packages/*/package.json apps/cli/package.json`), and add the version's entry to `CHANGELOG.md`.
2. Commit, push `main`, and wait for CI to pass: `gh run list --limit 1`.
3. Pack the packages and check them, as the next section says.
4. Publish from `main`: `pnpm publish -r --access public --no-git-checks`. It builds and publishes each package whose version isn't on npm yet, in dependency order, and skips the private ones. `--dry-run` shows which it would publish.
5. Tag the published commit `vX.Y.Z` and push the tag.
6. Check `npm view <name> version` for each package, then install them from npm in a scratch project.

Traps:

- **The untracked `.tasks/` folders make pnpm refuse to publish** ("Unclean working tree"), hence `--no-git-checks`. Check first that `git status --porcelain --untracked-files=no` prints nothing.
- **Claude Code's auto mode refuses `pnpm publish`**, since it makes something public. The user runs it by typing `! pnpm publish -r --access public --no-git-checks` in the prompt. (Seen 2026-11-10.)
- **npm never takes the same version twice**, even after an unpublish, so a broken release is fixed with a patch version.
- **A package's first publish adds a `0.0.0-stage` version**, npm's "temporary package placeholder for staged publishing", before the real one. For 0.1.0, the five placeholders came a minute before the real versions, and meanwhile `latest` pointed at them, which looks like a failed publish. Wait, then check that every package's `dist-tags` names the new version: `npm view <name> dist-tags`. (Seen 2026-11-10.)
- **The registry caches a 404.** After looking up a name before its first publish, `npm view <name>` and `npm install` can still answer 404 for several minutes after it is published. `npm view <name>@<version>` answers sooner. (Seen 2026-11-10.)
- **Publishing needs an npm account in the `skeudo` org, with two-factor authentication on**: `npm whoami`, then `npm org ls skeudo`. Without 2FA, npm answers "403 Forbidden … Two-factor authentication … is required to publish packages", and nothing is published. With it, add `--otp=<code>`. A code lasts about 30 seconds, and a rerun skips the versions already published, so a code that expires midway only needs a second run. (Seen 2026-11-10.)

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

## The site

skeudo.dev serves `apps/playground` from GitHub Pages: a landing page at `/` and the playground at `/playground/`, two Vite pages listed in `apps/playground/vite.config.ts`. `.github/workflows/site.yml` builds it and deploys it on each push to `main`, and its runs are listed by `gh run list --workflow site.yml`.

- **Never upload a local build.** `apps/playground/src/examples.ts` bundles every file in the gitignored `apps/playground/local-examples/`, which can hold private sketches. The workflow builds from a fresh checkout, which has none. The landing page imports its two sketches from `spec/fixtures/` instead, so its script stays small.
- **The settings**: `gh api repos/wlezzar/skeudo/pages` shows the source (GitHub Actions), the custom domain and whether HTTPS is enforced. The user verified skeudo.dev in their GitHub account's Pages settings, so no other account can serve a site on it.
- **DNS is on Cloudflare**, in the user's account: A and AAAA records on `skeudo.dev` for GitHub's four addresses, and `www` as a CNAME to `wlezzar.github.io`. They must stay "DNS only" (grey cloud), or GitHub can't see that the domain points at it, and can't renew its certificate. `dig +short skeudo.dev` prints GitHub's `185.199.*` addresses when they are right.
- **`.dev` is HTTPS only** in browsers, so the site shows an error until GitHub has issued its certificate.

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
