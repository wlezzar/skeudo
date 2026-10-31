# Sketch

Readable pseudocode for code review: loose about logic, strict about effects.
The format spec lives in [.tasks/001-design/spec.md](.tasks/001-design/spec.md).

## Layout

```
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
