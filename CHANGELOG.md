# Changelog

Skeudo's packages share one version: `@skeudo/core`, `@skeudo/html`, `markdown-it-skeudo`, `remark-skeudo` and the `skeudo` CLI. Until 1.0, a minor version (0.1 to 0.2) can change the format in ways that break sketches, and a patch version doesn't. Each entry says first what changed in the format, then in the packages.

## 0.1.0

The first release.

- **Format**: two views. `code` is pseudocode where every outside effect is tagged, with change tags for sketches of a commit or pull request, `::src` and `::repo` for source links, and `::doc` for explanations. `data` is a few tables and folders with example rows, and a story of steps and substeps that change them and read them. See [spec/spec.md](spec/spec.md).
- **Packages**: the parser (`@skeudo/core`), the HTML renderer with its stylesheet and browser script (`@skeudo/html`), plugins for markdown-it and remark, and a CLI that checks sketches and renders them as standalone pages.
