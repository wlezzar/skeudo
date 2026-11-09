# Testing

Vitest runs every `*.test.ts` in the repository from the root, with no per-package config. A path or a word narrows the run: `pnpm test packages/html`, `pnpm test grammar`. `pnpm typecheck` covers sources, tests and build scripts (see `tsconfig.json`).

## What each test covers

| Test | Checks |
| --- | --- |
| `packages/core/test/fixtures.test.ts` | Each fixture parses into its `.json`. Every ```` ```skeudo ```` block in `spec/*.md` and `skills/skeudo/**/*.md` parses with no warnings. |
| `packages/core/test/repo.test.ts` | `parseRepo` and `repoId`, the `::repo` URL forms. |
| `packages/html/test/` | Rendered markup: data tables, steps, folders and groups, `::doc`, `sk-fit-N` classes, source links. |
| `packages/markdown-it/test/`, `packages/remark/test/` | Fences, inline tag pills, front matter, MDX. |
| `apps/cli/test/cli.test.ts` | Builds the CLI bundle into a temporary folder and runs it as an installed CLI would run. |
| `apps/vscode/test/extension.test.ts` | The extension against a stand-in `vscode` module. Source links use real git repositories made in a temporary folder. |
| `apps/vscode/test/grammar.test.ts` | The TextMate grammar, run by VS Code's tokenizer with a vendored copy of VS Code's Markdown grammar (`apps/vscode/test/grammars/`), and that it agrees with the parser on every fixture. |

## Fixtures

[spec/fixtures/README.md](../spec/fixtures/README.md) describes the folders and the shape of the `.json` files. In short:

- Each `.skeudo` file in `spec/fixtures/<view>/` is compared with the `.json` next to it, through `toMatchFileSnapshot`.
- `pnpm test -u` rewrites the `.json` files. A new `.skeudo` file gets its `.json` on its first run.
- Either way, read `git diff spec/fixtures` against the spec before committing. The test only checks that the parser keeps doing what it does now.
- Warning messages are compared word for word.

## Running the packages from a script

The packages export TypeScript with extensionless imports, so `node` can't import them, even with type stripping (`ERR_MODULE_NOT_FOUND`). Two ways that work:

- **Through the CLI**, for checking or rendering: `pnpm build:cli`, then `node apps/cli/dist/skeudo.js check -` reads a sketch from stdin. See [apps/cli/README.md](../apps/cli/README.md).
- **Bundled with esbuild**, for anything else. Write the script in a scratch folder, outside the repository, and point esbuild at the CLI's dependencies, which link `@skeudo/core`, `@skeudo/html`, `markdown-it-skeudo` and `markdown-it`:

  ```sh
  NODE_PATH=$PWD/apps/cli/node_modules npx esbuild "$S/probe.ts" --bundle --platform=node --format=esm --log-level=warning --outfile="$S/probe.mjs" && node "$S/probe.mjs"
  ```

  `$S` is the scratch folder. Run it from the repository root. (Seen working 2026-11-09.)

`skeudo check spec/` exits with 1 because the warning fixtures warn on purpose. To check the spec's own sketches, use `skeudo check spec/*.md`.
