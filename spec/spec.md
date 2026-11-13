# Skeudo

Nov 9, 2026 · @Walid Lezzar

> **Alpha.** This format will change in ways that break existing sketches. Until 1.0, breaking changes come in minor versions (0.1 to 0.2), never in patches, and the [release notes](https://github.com/wlezzar/skeudo/releases) list each one.

Skeudo is a set of small text formats for explaining code to a reader: a reviewer, a new teammate, or an agent's user. Each format is a **view**, like Mermaid's diagram types. A view has its own grammar and its own rendering, and every view goes through the same tools: the Markdown plugins, the VS Code extension, the CLI and the agent skill.

## Views

| View | What it shows | Spec |
| --- | --- | --- |
| code | Pseudocode for code review: loose about logic, strict about effects, with every outside effect tagged | [code.md](code.md) |
| data | A data model: a few tables, example rows, and a story of how the rows change | [data.md](data.md) |

## Blocks

A block of any view is a **sketch**. In Markdown, a sketch lives in a fenced code block tagged `skeudo`. Renderers also accept `sketch`, the format's former working name. A file holding a single sketch has the extension `.skeudo`.

Every view uses the same fence and extension. A sketch starts by naming its view:

```skeudo
view: data
table customer(name, email)

Ana signs up
  + customer c1  name: Ana | email: ana@example.com
```

- **The header** is `view:` and a view's name, `code` or `data`, alone on the first line that isn't blank. Spaces around the name don't count.
- **Every sketch has a header**, code sketches included, so a reader always knows what they are looking at, even in plain text.
- **A sketch without a header still renders**, in the code view, with a warning on its first line. So does a sketch whose first line names a view that doesn't exist, such as `view: dat`. That line isn't a header, so it stays a line of the sketch, and its warning shows where the mistake is.
- **Only the first line is a header.** A later line reading `view: data` is just a line of the sketch.
- **The header is a line of the sketch.** Line numbers count it, so a warning's line matches the line in the block. Renderers don't show it.
- **Why a line, not a fence per view or a word after `skeudo`.** The view travels with the text when it is copied out of its fence, piped to the CLI or saved as a file. A new view adds no fence, file extension or editor language.
- **Why `view: data`, not a bare `data`.** A bare word reads like the start of the content, and a typo such as `dat` would make the sketch a one-line code sketch with no warning. `view:` says what the line is, and lets a parser warn about a name it doesn't know. A call form such as `view(data)` would look like the signature that often starts a code sketch.

### Warnings

A parser warns about the header whatever the view:

| Problem | Message |
| --- | --- |
| The first line that isn't blank isn't a header. The sketch is read as code | `A sketch should start with its view, as in view: code.` |
| The first line names a view that doesn't exist, as in `view: dat`. The sketch is read as code, that line included | `No view named dat. The views are code and data.` |

## Rules every view follows

- **A sketch always renders.** Problems are warnings attached to a line of the sketch, counted from its first line, never errors, so a half-written sketch can still be read.
- **Plain text stays readable.** A sketch is often read where Skeudo isn't rendered, such as on a code host or in a chat, so its text must make sense on its own.
- **Changes use the same colors in every view.** Something new is green, something changed is blue, and something removed is red.
