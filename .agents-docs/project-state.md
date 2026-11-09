# Project state

The state lives in git and in the plans. This note says where to look.

- **Done**: `git log --oneline`. Each commit's body says what changed in each package and how it was checked.
- **Plans**: `.tasks/<NNN-name>/plan.md`, one folder per piece of work, numbered in order. A plan records the design, the decisions with their reasons, and implementation notes, and is updated as the work goes. Some folders are tracked and some aren't (`git status --short .tasks`). An untracked one may hold sketches of a private project, so ask before committing it.
- **Format decisions**: the last section of each view's spec, `spec/code.md` and `spec/data.md`.
- **Next** (2026-11-09): publishing to npm and JSR, planned in `.tasks/002-publishing/plan.md` and waiting on decisions from the user. Until then every package is `"private": true` (`grep -l '"private": true' packages/*/package.json apps/*/package.json`). Later: a React package.
- **Left for the user to check**: the VS Code extension in a real editor, such as links opening files from another repository and the amber warning on a changed file, and remark-skeudo in Docusaurus.
