# Publishing plan

Written on 2026-11-01 and rewritten on 2026-11-09 with the user's decisions. Skeudo goes public in three stages. Each stage lists its steps, and a step is checked off when it is done.

## Decisions (2026-11-09)

- **License: MIT**, for the code and the spec. The copyright line reads "The Skeudo authors", which can change before the release.
- **The move to the user's `skeudo` GitHub org is on hold** (2026-11-10). The repository goes public as `wlezzar/skeudo`, and the package links point there. If the move happens later, GitHub redirects the old links.
- **The history goes public as it is** (2026-11-10). The user dropped the squash: an old commit names a private project and an old `mise.toml` held the user's home path, and both are fine to show. The commits carry the author's name and email, as any public repository's do.
- **skeudo.dev** is registered (by the user) and will host the playground.
- **Stages, not one big release.** 0.1 is npm only, published by hand. JSR, Changesets and publishing from CI come later.
- **First readers are VS Code and docs sites.** So 0.1 checks the Markdown plugins in real docs sites, and rendering sketches in GitHub pull requests waits.
- **The format promise until 1.0.** A minor version (0.1 to 0.2) may change the format in ways that break sketches. A patch version doesn't. Each format change is listed in `CHANGELOG.md`. There are still no aliases or migrations. A format change is released soon after it reaches `main`, since agents install the skill from `main` while renderers come from npm, and a skill ahead of the renderers writes sketches they can't draw.

## Packages

| Folder | npm | Later on JSR |
|---|---|---|
| `packages/core` | `@skeudo/core` | `@skeudo/core` |
| `packages/html` | `@skeudo/html` | `@skeudo/html` |
| `packages/markdown-it` | `markdown-it-skeudo` | `@skeudo/markdown-it` |
| `packages/remark` | `remark-skeudo` | `@skeudo/remark` |
| `apps/cli` | `skeudo` (installs the `skeudo` command) | maybe `@skeudo/cli` |

The five share one version, starting at 0.1.0. Not on npm: the VS Code extension (stage 3, versioned on its own), the playground (stage 3, on skeudo.dev) and the repository root.

## Stage 1: prepare, in the private repository (Claude)

On the `publishing` branch.

- [x] Remove what shouldn't go public: the private project's name in `apps/playground/src/examples.ts`, the home path in `mise.toml`. (Later the user decided that history may keep both.)
- [x] `LICENSE` at the root. The build copies it into each published package, since npm only packs a LICENSE from the package's own folder.
- [x] A build for the four libraries. Their sources import each other with `.ts` extensions, and `tsc -b` emits `dist/` with `.js` imports and declarations, through project references. `@skeudo/html` also gets one inlined `dist/skeudo.css`. The `exports` keep pointing at `src/` for development, and `publishConfig` points the published ones at `dist/`.
- [x] Package details: description, license, repository with `directory`, homepage, bugs, keywords, `engines`, `files`, `sideEffects`. Version 0.1.0, and no `private` on the five published packages.
- [x] READMEs for core, html and markdown-it, and the remark and CLI ones updated for npm. Each says "experimental, 0.x" at the top.
- [x] The root README as the public front page: what Skeudo is, a picture of each view, and how to get each piece (the skill, VS Code, the CLI, docs sites). The layout and commands stay below for contributors.
- [x] `CHANGELOG.md` with 0.1.0.
- [x] Test the packed tarballs in scratch projects, with npm and pnpm: imports, types under `nodenext` and `bundler`, the CSS export, `npx skeudo check`.
- [x] Docs sites: render a sketch in a VitePress site (markdown-it) and a Docusaurus site (remark and MDX), with the stylesheet and `enhance()`, and write the setup that worked into the plugin READMEs. Done, except dark mode in VitePress, now [issue #1](https://github.com/wlezzar/skeudo/issues/1).
- [x] CI: a GitHub Actions workflow that installs, type-checks, tests and builds on every push and pull request. Its steps pass locally on Node 22 and 24; it hasn't run on GitHub yet.
- [x] Update AGENTS.md (the format promise replaces "no backward compatibility") and `.agents-docs/` (the build, CI, releasing, traps found on this machine).

## Stage 2: go public (both)

- [x] The user creates the free `skeudo` npm org at https://www.npmjs.com/org/create ("create a new org"), and runs `npm login` on this machine.
- [x] Merge `publishing` into `main` and push. CI ran and passed on GitHub on its first push, on Node 22 and 24.
- [x] The user makes `wlezzar/skeudo` public (Settings, Danger Zone, Change visibility). The merged remote branches `remark-skeudo` and `vscode-extension` are deleted.
- [x] `AGENTS.md` no longer says nothing is published, and `.agents-docs/releasing.md` says how to release a version.
- [x] Publish 0.1.0 with `pnpm publish -r --access public --no-git-checks` (never `npm publish`, since pnpm rewrites `workspace:*`). The dry run from `main` at f92d6be published the five in dependency order, and the packed tarballs held what stage 1 tested. Claude Code's auto mode refused the real publish until the user allowed that one command. Its first run got a 403 at `@skeudo/core`, with nothing published, since npm requires 2FA to publish and the account didn't have it on yet. The user turned 2FA on and published from f92d6be on 2026-11-10. Tagged `v0.1.0`.
- [x] Check: all five have 0.1.0 as `latest`. A scratch project installed them from npm, rendered a sketch with each library, passed `tsc` under `nodenext` with `skipLibCheck` off, and ran `npx skeudo check` and `render`. `npx skills add wlezzar/skeudo --list` finds the skill.

## Stage 3: reach people

- **skeudo.dev**: the playground on GitHub Pages, deployed by a workflow.
  - [x] The user verified skeudo.dev in their GitHub account's Pages settings, so no other account can point a Pages site at it, and added the records in Cloudflare, "DNS only" (2026-11-10).
  - [x] `.github/workflows/site.yml` builds the playground from a fresh checkout and deploys it on each push to `main`. A local build would bundle the private `local-examples/`.
  - [ ] Pages turned on, with GitHub Actions as the source and skeudo.dev as the domain; the first deploy; HTTPS enforced once the certificate is issued.
  - [ ] A link to GitHub in the playground's header, and skeudo.dev in the root README, once it is live.
- **The VS Code extension**: the user tries it in a real VS Code first (`::repo` links into another repository, the amber warning on a changed file, `::doc` popovers). Then it goes to the Marketplace and Open VSX under the `skeudo` publisher, free on both on 2026-11-09, versioned on its own with tags like `vscode-v0.1.0`.
- **An announcement**, once the site and the extension are out.

## Later

- Changesets with a `fixed` group for the five packages, and a release workflow that publishes through npm trusted publishing (OIDC), with no stored token.
- JSR. The `.ts` imports from stage 1 are what JSR needs. Each package gets a `jsr.json`, imports between Skeudo packages resolve to `jsr:@skeudo/...`, and exported functions need explicit types ("slow types").
- Rendering sketches in GitHub pull requests, such as an Action that renders a PR's sketches and links them in a comment.
- A React package.

## Rules that shaped this plan

- npm forbids packages that exist only to reserve a name, so a real 0.1.0 reserves the names.
- Scoped names are protected once the npm org exists. Unscoped names (`skeudo`, `markdown-it-skeudo`, `remark-skeudo`) are only protected once published. All of them were still free on 2026-11-09.
- npm may treat a free org that hasn't published "within a reasonable time" as squatting, so the org is created right before the release.
- JSR versions generally can't be deleted after 24 hours, which is one more reason to wait until the format settles.

## To check later

- Whether npm still needs a package to exist before trusted publishing can be set up for it. It did in 2025.
- Whether JSR can serve `skeudo.css` as an export, and whether JSR's npm compatibility layer supports `bin`, which decides whether the CLI goes on JSR.

## What was built

Stage 1, on 2026-11-10:

- **Build**: the libraries' relative imports end in `.ts`. Each has a `tsconfig.build.json` with project references, and `scripts/build-library.mts` runs `tsc -b`, inlines `skeudo.css` and copies the LICENSE. Declarations keep `.ts` in their imports, which TypeScript 5.6 and 7 resolve under `nodenext`, `node16` and `bundler`. `.agents-docs/releasing.md` has the details and how to check the tarballs.
- **Node 22 or later** in `engines`, since Node 20 reached its end of life in April 2026. CI runs on 22 and 24.
- **The copyright line** reads "The Skeudo authors". The CLI tarball is `apps/cli/skeudo.tgz`, without the version, so `mise.toml` doesn't change on each release.
- **README pictures** are in `.github/readme/`, screenshots of the CLI's page.
- **Fixes the docs-site checks found**, each through every layer it touches, with tests where the html package can test it:
  - VitePress lost code indentation, since Vue drops whitespace-only text. The indentation is now a `span.sk-ind` with a width, and its spaces still copy.
  - Docusaurus turned inline tag pills into code blocks, since it renders every `code` element through its code block. Pills are now a `span.sk-inline`, in both plugins.
  - Docusaurus striped the data view's table heads. `data.css` resets `thead` and `tbody`.
  - After moving to another page of a docs site, a data sketch started at the step of the sketch in the same position on the previous page. `enhance()` now forgets the remembered steps when the address changes, and still keeps them when VS Code renders the same page again.

## Open

- **Dark mode in VitePress**, tracked in [issue #1](https://github.com/wlezzar/skeudo/issues/1). Sketches follow `data-theme` on `html` or else the system, and VitePress only adds a `dark` class, so they stay light in its dark mode, and dark when the system is dark and the reader picks light. Every site checked sets the CSS `color-scheme` (VitePress, Docusaurus, the CLI page), so the proposal is to define the colors with `light-dark()` and follow the page's `color-scheme`. The VS Code preview and the playground would set it too.
- `@skeudo/html`'s declarations name `HTMLElement`, so a project with neither the `dom` lib nor `skipLibCheck` gets type errors from them. Left as it is.
- The VS Code build warns that `apps/vscode/package.json` has no `"type"`. It did before this work; it belongs to the extension's stage.
