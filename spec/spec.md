# Skeudo

Nov 9, 2026 · @Walid Lezzar

Skeudo is a set of small text formats for explaining code to a reader: a reviewer, a new teammate, or an agent's user. Each format is a **view**, like Mermaid's diagram types. A view has its own grammar and its own rendering, and every view goes through the same tools: the Markdown plugins, the VS Code extension, the CLI and the agent skill.

## Views

| View | What it shows | Spec |
| --- | --- | --- |
| code | Pseudocode for code review: loose about logic, strict about effects, with every outside effect tagged | [code.md](code.md) |

## Blocks

A block of any view is a **sketch**. In Markdown, a sketch lives in a fenced code block tagged `skeudo`. Renderers also accept `sketch`, the format's former working name. A file holding a single sketch has the extension `.skeudo`.

Every sketch is in the code view for now.

## Rules every view follows

- **A sketch always renders.** Problems are warnings attached to a line of the sketch, counted from its first line, never errors, so a half-written sketch can still be read.
- **Plain text stays readable.** A sketch is often read where Skeudo isn't rendered, such as on a code host or in a chat, so its text must make sense on its own.
- **Changes use the same colors in every view.** Something new is green, something changed is blue, and something removed is red.
