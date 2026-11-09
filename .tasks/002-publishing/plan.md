# Publishing plan

Written on 2026-11-01. Nothing is published yet. This is the plan to pick up later.

## Goal

Publish every library to npm, under both scoped and unscoped names, and to JSR.

| Folder | npm | JSR |
|---|---|---|
| `packages/core` | `@skeudo/core` | `@skeudo/core` |
| `packages/html` | `@skeudo/html` | `@skeudo/html` |
| `packages/markdown-it` | `markdown-it-skeudo` | `@skeudo/markdown-it` |
| `packages/remark` | `remark-skeudo` | `@skeudo/remark` |
| `apps/cli` | `skeudo` (installs the `skeudo` command) | `@skeudo/cli`, if JSR can run it (see "To check") |

JSR only has scoped names, so the two plugins get `@skeudo/` names there. Not on npm: the VS Code extension (a separate track, below), the playground and the repo root.

The five npm packages share one version, as `.tasks/001-design` decided. JSR versions match the npm ones.

## Where things stand (2026-11-01)

- All five npm names were free, and so was `skeudo-vscode`. The `@skeudo` npm scope didn't exist.
- The `skeudo` scope was free on JSR, and the `skeudo` name was free on GitHub.
- Every package is `private: true` at 0.0.0 (the CLI at 0.0.1). There is no LICENSE and no CI. The GitHub repo is private.
- The libraries export their TypeScript source (`./src/index.ts`) and have no build step. The CLI already bundles itself with esbuild into `dist/skeudo.js`.
- This machine isn't logged in to npm.

## Rules that shaped this plan

- npm forbids packages that exist only to reserve a name, so there will be no empty placeholders. A real 0.1.0 reserves the names.
- Scoped names are protected once the npm org exists. But npm may treat a free org that hasn't published "within a reasonable time" as squatting (paid orgs never are), so create the org close to the first release.
- Unscoped names (`skeudo`, `markdown-it-skeudo`, `remark-skeudo`) are only protected once published publicly. Until then anyone can take them.
- Publishing makes the code public even if the repo stays private. npm packages contain the built JavaScript, and JSR serves the TypeScript source.
- JSR can't host private packages. JSR versions generally can't be deleted after 24 hours.
- Private npm packages need a paid plan and scoped names, so they don't fit this goal. We skip a private phase.

## Decisions for wlezzar

1. **License.** MIT is the usual choice for tools like these. Apache-2.0 if you want its patent grant. Nothing can be published until this is chosen.
2. **Make the GitHub repo public at the first release?** The code is public once published anyway. A public repo makes the `repository` links, issues and JSR's source links work.
3. **Publish the CLI on JSR** for Deno users, or keep it on npm only.

## Steps

### 1. Reserve the scopes (wlezzar: needs your npm and GitHub accounts)

- Create the free `skeudo` org at https://www.npmjs.com/org/create. Pick "create a new org", not "convert my account".
- Create the `skeudo` scope at https://jsr.io/new (sign in with GitHub).
- Run `npm login` on this machine before the first publish.

### 2. Make the packages publishable (Claude)

- Add a LICENSE at the root and copy it into each published package. npm only includes a LICENSE from the package's own folder.
- Add a build step for the four libraries: compile to `dist/` (`.js` and `.d.ts`) and copy `skeudo.css` with the per-view stylesheets it imports. Keep `exports` pointing at `src/` for development, and use pnpm's `publishConfig` to point the published `exports` at `dist/`.
- Fill in the metadata: description, license, repository (with `directory`), homepage, keywords (`remark-plugin`, `unified`, `markdown-it-plugin`, and so on), `engines` and `files`.
- Write READMEs for core, html and markdown-it (remark and the CLI already have one). Mark them "experimental, 0.x" at the top.
- Remove `private: true` from the five published packages only.
- Always publish with `pnpm publish`, never `npm publish`. pnpm rewrites `workspace:*` to real version numbers.
- Test the packed tarballs in a scratch project with both npm and pnpm: imports, types, the CSS export and `npx skeudo check`. Also do the outstanding Docusaurus check for remark-skeudo.

### 3. Add JSR (Claude)

- Add a `jsr.json` per package with its JSR name, version and exports. JSR takes TypeScript source, so no build is needed.
- Make imports between Skeudo packages resolve to `jsr:@skeudo/...` when published to JSR, not to the npm packages.
- Run `npx jsr publish --dry-run` and fix any "slow types" (exported functions need explicit types).

### 4. CI and releases (Claude)

- Add a GitHub Actions workflow that installs, type-checks, tests and builds on every push and pull request.
- Set up Changesets with a `fixed` group for the five packages, so they share a version.
- Add a release workflow. Changesets opens a "Version Packages" pull request, and merging it publishes to npm, then to JSR. A small script copies each package.json version into its jsr.json.
- Publish without stored tokens: npm trusted publishing and JSR's GitHub Actions publishing, both through OIDC.

### 5. First release, 0.1.0 (both)

- Publish 0.1.0 to npm from this machine. Dependencies go first (core, html, then markdown-it, remark and the CLI), and `pnpm publish -r` handles that order. Then publish to JSR.
- Set up trusted publishing for each package on npmjs.com, and link each JSR package to the GitHub repo. Later releases then go through CI.
- Verify: `npm view` each name, install the packages in a scratch project, and check the JSR pages and scores.

## To check when we start

- Whether npm still needs a package to exist before trusted publishing can be set up for it. It did in 2025, which is why step 5 publishes the first version by hand.
- Whether npm provenance works from a private repo.
- Whether JSR can serve `skeudo.css` as an export, and whether JSR's npm compatibility layer supports `bin`. The second answer decides whether the CLI goes on JSR.
- Whether the Changesets version step can update jsr.json directly, or the script is needed.

## Related, separate tracks

- **VS Code extension:** publish to the VS Code Marketplace and Open VSX, versioned separately (tags like `vscode-v0.1.0`). This needs a publisher ID and the license.
- **React package:** after the first release.
