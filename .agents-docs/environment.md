# Environment

What this machine has, and the traps found on it. Each fact gives the command to re-check it, or the date it was last seen to hold.

## Toolchain

- **Node and pnpm** come from mise: `mise ls`, `node --version`, `pnpm --version`. Node runs the `.mts` build scripts directly, with type stripping, but can't import the workspace packages ([testing.md](testing.md#running-the-packages-from-a-script)).
- **Install** with `pnpm install` after changing any `package.json`. `pnpm-workspace.yaml` lists the workspace folders.
- **mise tasks**: `mise tasks` lists them, and `mise.toml` defines them.
- **No CI.** There is no `.github/` folder, so `pnpm test` and `pnpm typecheck` run locally are the only gate.
- **Git**: `git remote -v` shows the GitHub remote, over SSH. Old feature branches are kept after merging; `git branch --no-merged main` shows any that hold unmerged work.

## Global installs that go stale

- **`skeudo` on PATH** is a packed build installed by `mise run install:cli`. It doesn't follow the source. Use `node apps/cli/dist/skeudo.js` after `pnpm build:cli` to test a change, and re-run the mise task when the user should get the new CLI.
- **The skeudo skill.** In this repository, `.claude/skills/skeudo` links to `skills/skeudo`, so an edit applies at once. Other projects use the copy in `~/.agents/skills/skeudo`, which `mise run install:skills` refreshes. Run it after changing the skill, or tell the user to.
- **agent-browser** is a global CLI (`agent-browser --version`). Its skill is vendored in `.agents/skills/agent-browser` and pinned in `skills-lock.json`.

## Known limits

- **agent-browser needs `--no-sandbox`.** Its Chrome exits with "No usable sandbox!" because AppArmor blocks unprivileged user namespaces on this Ubuntu machine. Launch it with `agent-browser --args "--no-sandbox" open <url>`, only for local or trusted pages, and tell the user. (Seen 2026-11-09.)
- **VS Code can't be run.** It isn't installed, and running a downloaded copy was refused by the permission check. [visual-checks.md](visual-checks.md#the-vs-code-preview) has the workaround, and in-editor checks are left to the user. (Seen 2026-10-31.)
