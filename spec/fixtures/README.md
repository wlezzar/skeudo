# Parser fixtures

Each `.sketch` file is an input, and the `.json` file next to it is what the parser must produce for it. Together they pin down the rules in [spec.md](../spec.md), including the cases the spec leaves to the parser.

- `examples/` holds the spec's examples, copied word for word.
- The other folders hold edge cases, grouped by spec section. `warnings/` holds sketches that must produce warnings.

## Expected output

The JSON is the parser's AST (`Sketch` in `packages/core/src/types.ts`), with these changes:

- `source` is removed, since it's the `.sketch` file.
- Lines lose `children` and `trailingStart`, which follow from `parent` and the tags' `trailing` flags.
- Tags lose their `start` and `end` offsets.
- A tag inside a line's segments is written as `{ "type": "tag", "raw": … }` instead of repeating the whole tag.
- Variables are keyed by name, without a `name` field.
- `flows` is added from `analyze()`: each line where a labeled variable reaches an effect, with the effect as its raw tag.
- `false`, missing values, empty arrays and empty objects are left out.

`packages/core/test/fixture.ts` does this conversion. Warning messages are compared word for word, so rewording one means updating the fixtures that produce it.

## Running

```sh
pnpm test        # compare every fixture
pnpm test -u     # rewrite the .json files after an intended change
```

A new `.sketch` file gets its `.json` written the first time the tests run, except in CI. Read it against the spec before committing. The test only checks that the parser keeps doing what it does now, so a wrong `.json` locks a bug in.

The same test run also checks that every sketch in `spec/spec.md` and `skills/sketch/SKILL.md` parses without warnings.
