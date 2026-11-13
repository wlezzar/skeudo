# Parser fixtures

Each `.skeudo` file is an input, and the `.json` file next to it is what the parser must produce for it. Each view's fixtures are in a folder named after it. The test checks that every fixture is parsed in its folder's view.

## code

The fixtures in `code/` pin down the rules in [code.md](../code.md), including the cases the spec leaves to the parser. Each starts with the `view: code` header, except in `header/`.

- `examples/` holds the spec's examples, copied word for word.
- The other folders hold edge cases, grouped by spec section. `warnings/` holds sketches that must produce warnings.
- `header/` holds the header rules of [spec.md](../spec.md), since a sketch without a header, or whose header names no view, is read as code.

The JSON is the parser's AST (`CodeSketch` in `packages/core/src/code/types.ts`), with these changes:

- `view` and `source` are removed, since they are the folder and the `.skeudo` file.
- Lines lose `children` and `trailingStart`, which follow from `parent` and the tags' `trailing` flags.
- Tags lose their `start` and `end` offsets.
- A tag inside a line's segments is written as `{ "type": "tag", "raw": … }` instead of repeating the whole tag.
- Variables are keyed by name, without a `name` field.
- `flows` is added from `analyze()`: each line where a labeled variable reaches an effect, with the effect as its raw tag.
- `changes` is added from `analyze()`: each change tag, whether it covers a whole block, and the effects on the lines it covers, as `L<line> <raw tag>`.
- `false`, missing values, empty arrays and empty objects are left out.

## data

The fixtures in `data/` pin down the rules in [data.md](../data.md). Each starts with the `view: data` header.

- `examples/` holds the spec's examples, copied word for word.
- `format/` and `story/` hold edge cases of the format and of how steps play. `header/` checks that line numbers count the header.
- `warnings/` holds one sketch per warning in the spec.

The JSON is the parser's output (`DataSketch` in `packages/core/src/data/types.ts`), without `view` and `source`. Each step without substeps, and each substep, gets a `rows` field, from `replayData()`: the rows of each table after it, with `status` for a row it added or deleted and `was` for the values it changed. Each read gets a `found` field: the ids of the rows it finds at its line. `false`, missing values, empty arrays and empty objects are left out, so a read that finds nothing has no `found`.

## Both views

`packages/core/test/fixture.ts` does the conversions. It parses with `parse()`, so the header's warnings show. Warning messages are compared word for word, so rewording one means updating the fixtures that produce it.

## Running

```sh
pnpm test        # compare every fixture
pnpm test -u     # rewrite the .json files after an intended change
```

A new `.skeudo` file gets its `.json` written the first time the tests run, except in CI. Read it against the spec before committing. The test only checks that the parser keeps doing what it does now, so a wrong `.json` locks a bug in.

The same test run also checks that every sketch in the spec and the agent skill parses without warnings.
