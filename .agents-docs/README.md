# Agent docs

Notes for agents working on this repository: what the code and its docs don't say, or say in too many places to find quickly. The sources stay the truth. These notes point at them and say how to check.

| Doc | Read it when |
| --- | --- |
| [architecture.md](architecture.md) | You need to find where something happens, or how a sketch goes from text to a page. |
| [changing-the-format.md](changing-the-format.md) | You change a view's syntax, warnings or rendering, or add a view. |
| [testing.md](testing.md) | You add or fix tests, update fixtures, or want to run the packages from a script. |
| [visual-checks.md](visual-checks.md) | You change rendering, CSS or interaction, and need to see it. |
| [environment.md](environment.md) | A tool fails, or you need to know what this machine has and what is installed globally. |
| [project-state.md](project-state.md) | You need what is done, what is next, and where plans live. |
| [releasing.md](releasing.md) | You change how packages are built or published, or check them as a user installs them, in a scratch project or a docs site. |

## Maintaining these docs

- **Budget.** Keep each file well under 5k tokens (about 3,500 words). `check.mjs` warns past 4k and fails past 5k. When a file grows past that, split it by task and add the parts to the table above, so an agent reads only the part it needs.
- **Point, don't copy.** Link to the file, or name the symbol and its file (`viewOf` in `packages/core/src/views.ts`), rather than restating what it says. Copy a fact only when finding it is costly and it rarely changes, and say where it came from.
- **Prefer a command to a value.** Versions, counts, file lists and status change. Give the command that prints them, not the number.
- **Date what you observed.** A fact about this machine or an outside tool gets the date it was last seen to hold, as in "(seen 2026-11-09)". Re-check it when you rely on it, and update the date.
- **One entry per fact.** Search first (`grep -ri <word> AGENTS.md .agents-docs`), and update the entry you find rather than adding a second.
- **Delete what's wrong.** If a note no longer holds, fix it or remove it. A stale note costs more than a missing one.
- **Write full paths from the repository root** in backticks, so `check.mjs` can tell when a file moves.
- **Add a row to the table above** for every new file, saying when to read it.

`node .agents-docs/check.mjs` checks every file's size, that relative links resolve, that repository paths in backticks exist, and that the table lists every file.
