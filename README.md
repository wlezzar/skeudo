# Sketch

Readable pseudocode for code review: loose about logic, strict about effects.
The format spec lives in [spec/spec.md](spec/spec.md).

## Layout

```
spec/
  spec.md        # the format: syntax, variables and labels, rendering
skills/
  sketch/        # agent skill that writes sketches of code, commits and PRs
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

Markdown files in `apps/playground/local-examples/` (gitignored) appear in the playground's Example menu, so you can try sketches of private code. Optional front matter sets the menu title and the base URL for source links:

```markdown
---
title: my-service a1b2c3d
srcBase: https://github.com/org/my-service/blob/a1b2c3d/
---
```
