# Sketch

Readable pseudocode for code review: loose about logic, strict about effects.
The format spec lives in [spec/spec.md](spec/spec.md).

## Layout

```
spec/
  spec.md        # the format: syntax, variables and labels, rendering
packages/
  core/          # parser (parse), analysis (analyze), AST types
  html/          # toHtml(), tagHtml(), enhance() + sketch.css
  markdown-it/   # markdown-it-sketch: renders ```sketch fences and inline tag code
apps/
  playground/    # live editor: preview, review panel, AST
```

Packages export their TypeScript sources directly; there is no build step until we publish.

## Run

```sh
pnpm install
pnpm dev         # http://localhost:5173
pnpm typecheck
pnpm build       # static playground in apps/playground/dist
```
