# Sketch for VS Code

Highlights sketches in the editor and renders them in VS Code's Markdown preview. A sketch is pseudocode for code review where every outside effect is tagged; the format is defined in [spec/spec.md](https://github.com/wlezzar/skeudo/blob/main/spec/spec.md).

````markdown
```sketch
get_profile(user_id):                    ::src[app/profile.py:12-24]
    cached = cache.get(user_id)          ::read:redis[lookup by key]
    ...
```
````

## Highlighting

Sketch fences in Markdown files and `.sketch` files are highlighted in the editor. Tags are colored by kind, with notes muted, dangers in bold and `::src` tags muted like comments. Calls, the signature, its parameters, bindings and the first word of each line are colored as in code.

The colors come from your theme, so they vary from theme to theme; VS Code's default themes give reads, writes, failures and changes their own colors. To change a color, add a rule to `editor.tokenColorCustomizations` for the scope below, or for the first scope **Developer: Inspect Editor Tokens and Scopes** shows on the token:

```json
"editor.tokenColorCustomizations": {
  "textMateRules": [
    { "scope": "entity.name.write.sketch", "settings": { "foreground": "#c2410c" } }
  ]
}
```

| Element | Scope |
| --- | --- |
| `::read:…` | `support.type.read.sketch` |
| `::write:…` | `entity.name.write.sketch` |
| `::fail:…` | `invalid.fail.sketch` |
| `::untrusted:…`, `::secret:…` | `markup.underline.untrusted.sketch`, `markup.underline.secret.sketch` |
| `::danger[…]` and danger notes, `[!…]` | `constant.character.escape.danger.sketch` |
| `::new`, `::changed[…]`, `::removed` | `markup.inserted.new.sketch`, `markup.changed.sketch`, `markup.strikethrough.removed.sketch` |
| `::src[…]` | `comment.src.sketch` |
| Any other tag, such as `::todo` | `entity.name.label.todo.sketch` |
| Note | `comment.note.sketch` |
| `?` and `~` modifiers, runtime system `*` | `storage.modifier.conditional.sketch`, `storage.modifier.unverified.sketch`, `constant.language.wildcard.sketch` |
| Signature name, call | `entity.name.function.sketch` |
| Parameter, binding | `variable.parameter.sketch`, `entity.name.variable.sketch` |
| First word of a line | `keyword.control.first-word.sketch` |

Each whole tag is also `meta.tag.<family>.sketch`, for rules that need it as a parent scope: `read`, `write`, `fail`, `label`, `danger`, `new`, `changed`, `removed`, `src` or `other`.

The editor can't match everything the preview does. It doesn't know which words are variables, so a line that starts with one still gets its first word colored, and it takes a call alone on the first line for a signature even when no indented lines follow.

## Preview

Open a Markdown file and run **Markdown: Open Preview to the Side** (`Ctrl+K V`). In the preview:

- Hovering a variable highlights its uses in the sketch; clicking it keeps them highlighted.
- Clicking a `::src` location opens the file with those lines selected. Paths are resolved from the workspace folder, so open the repository the sketch describes.
- Inline code made only of tags, such as `` `::read:postgres` ``, renders as pills.

Colors follow VS Code's light or dark theme, and sketches use the editor's font.

## Settings

| Setting | Default | |
| --- | --- | --- |
| `sketch.labelKinds` | `["untrusted", "secret"]` | Tag kinds whose value labels a variable. Every later use of a labeled variable is marked. |
| `sketch.kindColors` | `{}` | CSS colors for tag kinds, such as `{ "todo": "#8b5cf6" }`. |

## Build and install

From the repository root:

```sh
pnpm install
pnpm package:vscode     # writes apps/vscode/sketch-0.0.1.vsix
code --install-extension apps/vscode/sketch-0.0.1.vsix
```

Then reload VS Code. To try a change without installing it, run `pnpm --filter sketch build` and start VS Code with `code --extensionDevelopmentPath="$PWD/apps/vscode"`.
