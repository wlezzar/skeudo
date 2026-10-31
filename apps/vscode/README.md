# Sketch for VS Code

Renders sketch fences in VS Code's Markdown preview. A sketch is pseudocode for code review where every outside effect is tagged; the format is defined in [spec/spec.md](https://github.com/wlezzar/skeudo/blob/main/spec/spec.md).

````markdown
```sketch
get_profile(user_id):                    ::src[app/profile.py:12-24]
    cached = cache.get(user_id)          ::read:redis[lookup by key]
    ...
```
````

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
