# Changing the format

The spec, the fixtures, the parser, the renderer, the editor grammar, the skill and the playground all describe the same syntax. A change that skips one leaves them disagreeing, and only some of the gaps fail a test.

## A change to one view

Work in this order. `<view>` is `code` or `data`.

1. **Spec**: `spec/<view>.md`. The syntax, the warning's exact message under Warnings, the rendering, and the decision with its reason under the decisions section at the end. Every sketch in the spec must parse with no warnings, which the fixture test checks. The spec's examples are also copied word for word into `spec/fixtures/<view>/examples/`, so update both.
2. **Fixtures**: add `.skeudo` cases under `spec/fixtures/<view>/`, with one file per new warning in `warnings/`. Run `pnpm test`, then read each new or changed `.json` against the spec. See [testing.md](testing.md#fixtures).
3. **Core**: `packages/core/src/<view>/`, usually `types.ts` and `parse.ts`. Export new names from `packages/core/src/index.ts`.
4. **HTML**: `packages/html/src/<view>/` for the renderer, the CSS, and `enhance.ts` when the change is interactive. Tests go in `packages/html/test/`.
5. **Grammar**: `apps/vscode/src/grammars/<view>.ts` and `apps/vscode/test/grammar.test.ts`, which also checks that the grammar agrees with the parser on every fixture. New scopes go in the tables in `apps/vscode/README.md`.
6. **Skill**: `skills/skeudo/SKILL.md` for the code view, `skills/skeudo/data.md` for the data view. Their sketches are tested like the spec's.
7. **Playground**: an example in `apps/playground/src/examples.ts` when the change is visible.
8. **Check**: `pnpm test`, `pnpm typecheck`, and a look in a browser, in light and dark and at a few widths ([visual-checks.md](visual-checks.md)).

A recent change that went through every layer, without its fixtures:

```sh
git show --stat=120 --format= c34652d -- . ':!spec/fixtures'
```

Change the old form in place rather than keeping it working (see the rules in [AGENTS.md](../AGENTS.md)). Warning messages are compared word for word in the fixtures, so rewording one means running `pnpm test -u` and reading the diff.

## Adding a view

The data view was added in two commits: e968eae organized the code by view with no change in behavior, then 9e16dfc added the view. Their messages explain the design (`git show -s e968eae 9e16dfc`). The steps:

1. **Spec**: `spec/<name>.md`, a row in the Views table of `spec/spec.md`, the list of views in the header's warning message there, and fixtures in `spec/fixtures/<name>/` that start with the header line, `view: <name>`.
2. **Core**: `packages/core/src/<name>/` with a parser that takes the whole block, header included, skips the header line (`readHeader` in `packages/core/src/header.ts`) and keeps line numbers. Add its type to `Sketch` and a `View` to `VIEWS` in `packages/core/src/views.ts`, and export it from `packages/core/src/index.ts`. The fixture test needs an entry in `PROJECTIONS` (`packages/core/test/fixtures.test.ts`) with a projection in `packages/core/test/fixture.ts`.
3. **HTML**: `packages/html/src/<name>/` with a renderer to hast, a case in `toHast` and a call in `enhance()` (`packages/html/src/index.ts`), and its CSS imported in `packages/html/src/skeudo.css`. Pick a class prefix.
4. **Grammar**: `apps/vscode/src/grammars/<name>.ts`, added to `VIEWS` in `apps/vscode/src/grammars/index.ts` with a header rule.
5. **Docs**: a guide in `skills/skeudo/` linked from `skills/skeudo/SKILL.md`, a playground example, and the line that says what a sketch is in `README.md`, `apps/cli/README.md`, `apps/vscode/README.md` and `packages/remark/README.md`.
6. **These docs**: the seams command in [architecture.md](architecture.md#where-the-views-are-listed) should list the new names.
