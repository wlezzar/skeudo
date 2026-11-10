# Project state

The state lives in git and in the plans. This note says where to look.

- **Done**: `git log --oneline`. Each commit's body says what changed in each package and how it was checked.
- **Plans**: `.tasks/<NNN-name>/plan.md`, one folder per piece of work, numbered in order. A plan records the design, the decisions with their reasons, and implementation notes, and is updated as the work goes. Some folders are tracked and some aren't (`git status --short .tasks`). An untracked one may hold sketches of a private project, so ask before committing it.
- **Format decisions**: the last section of each view's spec, `spec/code.md` and `spec/data.md`.
- **Next** (2026-11-10): stage 3 of `.tasks/002-publishing/plan.md`: the playground on skeudo.dev, the VS Code extension on the Marketplace and Open VSX, then an announcement. The repository is public, and 0.1.0 went to npm on 2026-11-10. Later: JSR, a React package.
- **Left for the user to check**: the VS Code extension in a real editor, such as links opening files from another repository and the amber warning on a changed file.
