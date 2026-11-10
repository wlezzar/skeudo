# Project state

The state lives in git and in the plans. This note says where to look.

- **Done**: `git log --oneline`. Each commit's body says what changed in each package and how it was checked.
- **Plans**: `.tasks/<NNN-name>/plan.md`, one folder per piece of work, numbered in order. A plan records the design, the decisions with their reasons, and implementation notes, and is updated as the work goes. Some folders are tracked and some aren't (`git status --short .tasks`). An untracked one may hold sketches of a private project, so ask before committing it.
- **Format decisions**: the last section of each view's spec, `spec/code.md` and `spec/data.md`.
- **Next** (2026-11-10): the first release, 0.1.0, on npm. The plan is `.tasks/002-publishing/plan.md`, and its checklist says what is done. Stage 1 is on the `publishing` branch. The repository goes public as it is, history included. Later: JSR, a React package.
- **Left for the user to check**: the VS Code extension in a real editor, such as links opening files from another repository and the amber warning on a changed file.
