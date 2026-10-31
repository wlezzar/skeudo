I'd use a single monorepo, including the VS Code extension, at least until the spec settles. The spec is still young, so most changes will touch several packages at once. A new marker modifier, for example, means updating the spec, the fixtures, the parser, the grammar, the CSS, and the extension together. In one repo that's one pull request. Across repos, it's a publish-then-bump-versions cycle for every small change.

```
sketch/
  spec/
    spec.md
    fixtures/          # *.sketch inputs + expected *.json ASTs
  packages/
    core/              # parser, AST, analysis
    html/              # toHtml() + sketch.css
    react/
    remark/            # published as remark-sketch
    markdown-it/       # published as markdown-it-sketch
    grammar/           # TextMate grammar + markdown fence injection
  apps/
    vscode/            # extension, never published to npm
    playground/        # docs site + live editor
```

A few reasons this layout fits:

- **Fixtures sit at the root because they're the real contract.** The parser tests against them, and so does the TextMate grammar, through a grammar test runner like `vscode-tmgrammar-test`. That's the only thing keeping two independent implementations of the syntax in agreement, and it's easiest when both live next to the fixtures.
- **The extension is an app, not a package.** It ships to the VS Code Marketplace and Open VSX (which covers VSCodium and Cursor), not to npm. Bundle it with esbuild so it pulls `core`, `html`, and `markdown-it` straight from the workspace. Then package it with `vsce package --no-dependencies`, which avoids the known friction between `vsce` and pnpm's symlinked dependencies.
- **The playground dogfoods everything.** A docs site built with the remark plugin and the React package, with a live editor, is your demo, your documentation, and your integration test in one place.

For tooling, pnpm workspaces plus Changesets for versioning is enough. Turborepo can come later if builds get slow. I'd version the npm packages in lockstep, tied to the spec version, so users never have to work out which `core` is compatible with which `react`. Changesets supports this with a "fixed" group. The extension keeps its own version, released from a separate CI workflow triggered by tags like `vscode-v0.3.0`.

Package names follow ecosystem conventions: `remark-*` and `markdown-it-*` are how people search for plugins, so publish under those prefixes even if the rest sits under a scope.

I'd only split in two situations. First, someone writes a second implementation in another language, say a Rust or Python parser. At that point `spec/` and its fixtures should move to their own repo as the neutral source of truth. Second, the extension grows into something heavy, like a full language server with its own contributors and release rhythm. Neither applies yet.