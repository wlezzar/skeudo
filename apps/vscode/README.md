# Skeudo for VS Code

> **Alpha.** The format will change in ways that break existing sketches. Until 1.0, breaking changes come in the format's minor versions (0.1 to 0.2), and the extension's [changelog](https://github.com/wlezzar/skeudo/blob/main/apps/vscode/CHANGELOG.md) says which format each version reads.

Highlights sketches in the editor and renders them in VS Code's Markdown preview. A sketch is pseudocode for code review where every outside effect is tagged, or a data model drawn as tables and a story of how their rows change, and its first line says which: `view: code` or `view: data`. The format is defined in [spec/spec.md](https://github.com/wlezzar/skeudo/blob/main/spec/spec.md).

````markdown
```skeudo
view: code
get_profile(user_id):                    ::src[app/profile.py:12-24]
    cached = cache.get(user_id)          ::read:redis[lookup by key]
    ...
    ::repo[git+https://github.com/org/shop@a1b2c3d]
```
````

## Highlighting

Sketches in Markdown fences tagged `skeudo` (or `sketch`) and in `.skeudo` files are highlighted in the editor. Tags are colored by kind, with notes muted, dangers in bold and `::src`, `::repo` and `::doc` tags muted like comments. Calls, the signature, its parameters, bindings and the first word of each line are colored as in code.

The colors come from your theme, so they vary from theme to theme; VS Code's default themes give reads, writes, failures and changes their own colors. To change a color, add a rule to `editor.tokenColorCustomizations` for the scope below, or for the first scope **Developer: Inspect Editor Tokens and Scopes** shows on the token:

```json
"editor.tokenColorCustomizations": {
  "textMateRules": [
    { "scope": "entity.name.write.skeudo", "settings": { "foreground": "#c2410c" } }
  ]
}
```

| Element | Scope |
| --- | --- |
| `::read:…` | `support.type.read.skeudo` |
| `::write:…` | `entity.name.write.skeudo` |
| `::fail:…` | `invalid.fail.skeudo` |
| `::untrusted:…`, `::secret:…` | `markup.underline.untrusted.skeudo`, `markup.underline.secret.skeudo` |
| `::danger[…]` and danger notes, `[!…]` | `constant.character.escape.danger.skeudo` |
| `::new`, `::changed[…]`, `::removed` | `markup.inserted.new.skeudo`, `markup.changed.skeudo`, `markup.strikethrough.removed.skeudo` |
| `::src[…]`, `::repo[…]` | `comment.src.skeudo` |
| `::doc[…]` | `comment.doc.skeudo` |
| Any other tag, such as `::todo` | `entity.name.label.todo.skeudo` |
| Note | `comment.note.skeudo` |
| `?` and `~` modifiers, runtime system `*` | `storage.modifier.conditional.skeudo`, `storage.modifier.unverified.skeudo`, `constant.language.wildcard.skeudo` |
| Signature name, call | `entity.name.function.skeudo` |
| Parameter, binding | `variable.parameter.skeudo`, `entity.name.variable.skeudo` |
| First word of a line | `keyword.control.first-word.skeudo` |

Each whole tag is also `meta.tag.<family>.skeudo`, for rules that need it as a parent scope: `read`, `write`, `fail`, `label`, `danger`, `new`, `changed`, `removed`, `src`, `doc` or `other`.

In a data sketch:

| Element | Scope |
| --- | --- |
| The `view: code` or `view: data` line that names the view | `keyword.control.view.skeudo` |
| `table` or `folder`, the word that starts a declaration | `storage.type.kind.skeudo` |
| Table or folder name, in a declaration, a change or a read | `entity.name.type.table.skeudo` |
| Column | `variable.other.property.column.skeudo` |
| `->` in a reference | `keyword.operator.reference.skeudo` |
| Group label, in `[label]` | `entity.name.namespace.group.skeudo` |
| Step title | `markup.heading.step.skeudo` |
| Substep title, after `>` | `markup.heading.substep.skeudo` |
| `+`, `~`, `-` | `markup.inserted.skeudo`, `markup.changed.skeudo`, `markup.deleted.skeudo` |
| `?`, which starts a read | `support.type.read.skeudo`, as for `::read` tags |
| Row id, or the path prefix a read lists | `variable.other.constant.id.skeudo` |
| Value, `null`, quoted value | `string.unquoted.value.skeudo`, `constant.language.null.skeudo`, `string.quoted.double.skeudo` |
| Explanation | `comment.block.documentation.explanation.skeudo` |

The editor can't match everything the preview does. It doesn't know which words are variables, so a line that starts with one still gets its first word colored, and it takes a call alone on the line after the header for a signature even when no indented lines follow. In a data sketch inside a Markdown list item, every line is indented by the list, so step titles are colored as explanations.

## Preview

Open a Markdown file and run **Markdown: Open Preview to the Side** (`Ctrl+K V`). In the preview:

- Hovering a variable highlights its uses in the sketch; clicking it keeps them highlighted.
- Hovering over a call or a line explained with `::doc`, or moving to it with Tab, shows the explanation. Lines with one have a small ⓘ after their code.
- Clicking a `::src` location opens the file with those lines selected. See Source links below.
- Inline code made only of tags, such as `` `::read:postgres` ``, renders as pills.
- A data sketch starts at its first step. Click a step, or use the arrow keys after clicking the sketch, to see the rows change. Hovering over a reference highlights the row it points at. Resting on a step, a table's name or a group's label shows its explanation, and clicking its ⓘ keeps it open.

Colors follow VS Code's light or dark theme, and sketches use the editor's font.

### Source links

A sketch that names its repository with `::repo`, as in `::repo[git+https://github.com/org/shop@a1b2c3d]`, opens files from a local copy of that repository, wherever the Markdown file is. The extension looks for the copy in this order:

1. The `skeudo.repositories` setting.
2. The repository that holds the Markdown file.
3. The folders open in the window.
4. Repositories you have opened in VS Code since installing the extension, in any window.

A copy matches when one of its remotes points to the same repository, however it was cloned. When the file has changed since the sketch's revision, its links turn amber and their tooltip says the lines may have moved. Without a local copy, links open the file on GitHub, GitLab or Bitbucket at the sketch's revision; add other servers of those kinds to `skeudo.gitHosts`. A `git+file://` repository opens from that folder.

In a workspace you haven't trusted, the extension runs no git commands, so it only finds copies through the setting and the repositories it remembers, and it doesn't check revisions.

A sketch without `::repo` opens paths from the workspace folder, so open the repository the sketch describes.

## Settings

| Setting | Default | |
| --- | --- | --- |
| `skeudo.labelKinds` | `["untrusted", "secret"]` | Tag kinds whose value labels a variable. Every later use of a labeled variable is marked. |
| `skeudo.kindColors` | `{}` | CSS colors for tag kinds, such as `{ "todo": "#8b5cf6" }`. |
| `skeudo.repositories` | `{}` | Local copies of repositories, for `::repo` links, such as `{ "github.com/org/shop": "~/code/shop" }`. A user setting, since the paths belong to one machine. |
| `skeudo.gitHosts` | `{}` | Other GitHub, GitLab or Bitbucket servers, such as `{ "git.example.com": "gitlab" }`, for links to repositories with no local copy. |

## Install

Install **Skeudo** from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=wlezzar.skeudo-vscode), or from [Open VSX](https://open-vsx.org/extension/wlezzar/skeudo-vscode) in VSCodium, Cursor and other editors that use it. From a terminal:

```sh
code --install-extension wlezzar.skeudo-vscode
```

## Build from source

From the repository root:

```sh
pnpm install
pnpm package:vscode     # writes apps/vscode/skeudo-vscode-0.1.0.vsix
code --install-extension apps/vscode/skeudo-vscode-0.1.0.vsix
```

Then reload VS Code. To try a change without installing it, run `pnpm --filter skeudo-vscode build` and start VS Code with `code --extensionDevelopmentPath="$PWD/apps/vscode"`.
