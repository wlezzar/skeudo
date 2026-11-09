# Skeudo

Nov 9, 2026 · @Walid Lezzar

Skeudo is a set of small text formats for explaining code to a reader: a reviewer, a new teammate, or an agent's user. Each format is a **view**, like Mermaid's diagram types. A view has its own grammar and its own rendering, and every view goes through the same tools: the Markdown plugins, the VS Code extension, the CLI and the agent skill.

## Views

| View | What it shows | Spec |
| --- | --- | --- |
| code | Pseudocode for code review: loose about logic, strict about effects, with every outside effect tagged | [code.md](code.md) |
| data | A data model: a few tables, example rows, and a story of how the rows change | [data.md](data.md) |

## Blocks

A block of any view is a **sketch**. In Markdown, a sketch lives in a fenced code block tagged `skeudo`. Renderers also accept `sketch`, the format's former working name. A file holding a single sketch has the extension `.skeudo`.

Every view uses the same fence and extension. A sketch names its view on its first line, as Mermaid diagrams do:

```skeudo
data
customer(name, email)

Ana signs up
  + customer c1  name: Ana | email: ana@example.com
```

- **The header** is a view's name alone on the first line that isn't blank: `code` or `data`. Spaces around it don't count.
- **A sketch without a header is in the code view.** So a code sketch doesn't need one. A code sketch whose first line is exactly a view's name needs a `code` header.
- **The header is a line of the sketch.** Line numbers count it, so a warning's line matches the line in the block. Renderers don't show it.
- **Why a line, not a fence per view or a word after `skeudo`.** The view travels with the text when it is copied out of its fence, piped to the CLI or saved as a file. A new view adds no fence, file extension or editor language.

## Rules every view follows

- **A sketch always renders.** Problems are warnings attached to a line of the sketch, counted from its first line, never errors, so a half-written sketch can still be read.
- **Plain text stays readable.** A sketch is often read where Skeudo isn't rendered, such as on a code host or in a chat, so its text must make sense on its own.
- **Changes use the same colors in every view.** Something new is green, something changed is blue, and something removed is red.
