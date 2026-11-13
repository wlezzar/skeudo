# Project state

The state lives in git and in the plans. This note says where to look.

- **Done**: `git log --oneline`. Each commit's body says what changed in each package and how it was checked.
- **Plans**: `.tasks/<NNN-name>/plan.md`, one folder per piece of work, numbered in order. A plan records the design, the decisions with their reasons, and implementation notes, and is updated as the work goes. Some folders are tracked and some aren't (`git status --short .tasks`). An untracked one may hold sketches of a private project, so ask before committing it.
- **Format decisions**: the last section of each view's spec, `spec/code.md` and `spec/data.md`.
- **Next** (2026-11-11): the announcement. The repository is public, 0.1.0 is on npm, the site is live at https://skeudo.dev, and the extension is on the Marketplace and Open VSX as `wlezzar.skeudo-vscode`, all since 2026-11-10. `pnpm release` says what is released and what is next. Later: JSR, a React package.
