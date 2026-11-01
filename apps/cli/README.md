# skeudo

Checks sketches and renders them as standalone HTML pages. A sketch is pseudocode for code review where every outside effect is tagged. The format, Skeudo, is defined in [spec/spec.md](https://github.com/wlezzar/skeudo/blob/main/spec/spec.md).

```sh
skeudo check docs/                  # warnings in every sketch under docs/
skeudo render pr-123.md -o pr.html  # a page to send to someone
```

## Input

- A `.md` or `.markdown` file is Markdown: every ` ```skeudo ` fence in it is a sketch (` ```sketch ` works too).
- A `.skeudo` file is a sketch.
- A directory is searched for both, skipping hidden folders and `node_modules`.
- With no path, or with `-`, the input is read from stdin. Any input other than a `.md`, `.markdown` or `.skeudo` file is Markdown when it has a sketch fence, and a sketch otherwise.

## check

```
skeudo check [path...]
```

Prints the parser's warnings, listed under Warnings in the spec, at their lines in the file, then a summary:

```
docs/refunds.md:13: warning: ::fail needs a name, as in ::fail:NotFound.
docs/refunds.md:18: warning: ::write needs the system it touches, as in ::write:postgres.
Checked 4 sketches in 3 files: 2 warnings.
```

It exits with 0 when there are no warnings, 1 when there are, and 2 when a file can't be read or the command is wrong. To check a sketch before saving it, pipe it in:

```sh
skeudo check <<'EOF'
get_user(id):
    row = find(id)    ::read:postgres.users
EOF
```

## render

```
skeudo render [file] [-o out.html] [--src-base <url>]
```

Writes one HTML page with the styles and the variable highlighting inlined, so it loads nothing from elsewhere and can be sent as a file. It follows the reader's light or dark mode. The page goes to stdout unless `-o` names a file, and warnings go to stderr; a sketch with warnings still renders.

The title is the front matter's `title`, or else the first `#` heading, the sketch's function name, or the file name. `::src` locations link under `--src-base`, or the front matter's `srcBase`:

```markdown
---
title: shop a1b2c3d
srcBase: https://github.com/org/shop/blob/a1b2c3d/
---
```

## Install

skeudo isn't on npm yet. Build it from the repository, with Node 20 or later:

```sh
pnpm install
pnpm build:cli                                   # apps/cli/dist/skeudo.js, one file with no dependencies
node apps/cli/dist/skeudo.js check docs/

pnpm package:cli                                 # apps/cli/skeudo-0.0.1.tgz
npm install -g apps/cli/skeudo-0.0.1.tgz         # puts skeudo on your PATH
```
