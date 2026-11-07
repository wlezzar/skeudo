# Skeudo for VS Code

Highlights sketches in the editor and renders them in VS Code's Markdown preview. A sketch is pseudocode for code review where every outside effect is tagged; the format is defined in [spec/spec.md](https://github.com/wlezzar/skeudo/blob/main/spec/spec.md).

````markdown
```skeudo
get_profile(user_id):                    ::src[app/profile.py:12-24]
    cached = cache.get(user_id)          ::read:redis[lookup by key]
    ...
    ::repo[git+https://github.com/org/shop@a1b2c3d]
```
````

## Highlighting

Sketches in Markdown fences tagged `skeudo` (or `sketch`) and in `.skeudo` files are highlighted in the editor. Tags are colored by kind, with notes muted, dangers in bold and `::src` and `::repo` tags muted like comments. Calls, the signature, its parameters, bindings and the first word of each line are colored as in code.

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
| Any other tag, such as `::todo` | `entity.name.label.todo.skeudo` |
| Note | `comment.note.skeudo` |
| `?` and `~` modifiers, runtime system `*` | `storage.modifier.conditional.skeudo`, `storage.modifier.unverified.skeudo`, `constant.language.wildcard.skeudo` |
| Signature name, call | `entity.name.function.skeudo` |
| Parameter, binding | `variable.parameter.skeudo`, `entity.name.variable.skeudo` |
| First word of a line | `keyword.control.first-word.skeudo` |

Each whole tag is also `meta.tag.<family>.skeudo`, for rules that need it as a parent scope: `read`, `write`, `fail`, `label`, `danger`, `new`, `changed`, `removed`, `src` or `other`.

The editor can't match everything the preview does. It doesn't know which words are variables, so a line that starts with one still gets its first word colored, and it takes a call alone on the first line for a signature even when no indented lines follow.

## Preview

Open a Markdown file and run **Markdown: Open Preview to the Side** (`Ctrl+K V`). In the preview:

- Hovering a variable highlights its uses in the sketch; clicking it keeps them highlighted.
- Clicking a `::src` location opens the file with those lines selected. See Source links below.
- Inline code made only of tags, such as `` `::read:postgres` ``, renders as pills.

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

## Build and install

From the repository root:

```sh
pnpm install
pnpm package:vscode     # writes apps/vscode/skeudo-vscode-0.0.1.vsix
code --install-extension apps/vscode/skeudo-vscode-0.0.1.vsix
```

Then reload VS Code. To try a change without installing it, run `pnpm --filter skeudo-vscode build` and start VS Code with `code --extensionDevelopmentPath="$PWD/apps/vscode"`.
