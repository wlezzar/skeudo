# Agent guide

Skeudo is a set of small text formats for explaining code to a reader. Each format is a **view**: `code` is pseudocode with every outside effect tagged, and `data` is a few tables with example rows and a story of how they change. The repository holds the spec, a parser, an HTML renderer, markdown-it and remark plugins, a CLI, a VS Code extension, a playground and an agent skill. Nothing is published yet: the first release, 0.1.0, is being prepared in [.tasks/002-publishing/plan.md](.tasks/002-publishing/plan.md).

Read only what your task needs:

- [README.md](README.md): the folder layout and the `pnpm` commands.
- [spec/spec.md](spec/spec.md): the format. It is the source of truth, and each view has its own spec next to it.
- [.agents-docs/README.md](.agents-docs/README.md): notes for agents, indexed by task: architecture, changing the format, tests, checking renders, this machine, project state.

## Check your work

```sh
pnpm test        # every package, a few seconds; `pnpm test packages/html` runs one folder
pnpm typecheck
```

Both must pass before you say a change works. A change to how sketches look also needs a look in a browser: see [visual-checks.md](.agents-docs/visual-checks.md).

## Rules

- **The spec leads.** A format change starts in `spec/<view>.md` and goes through every layer. [changing-the-format.md](.agents-docs/changing-the-format.md) lists them.
- **No backward compatibility until 1.0.** Change the format in place, with no aliases, migrations or deprecation warnings. Once 0.1.0 is out, a format change also needs a line in [CHANGELOG.md](CHANGELOG.md) and the next minor version (0.1 to 0.2), and is released soon after it reaches `main`, since agents install the skill from `main` while renderers come from npm.
- **Read generated fixtures.** `pnpm test -u` rewrites `spec/fixtures/**/*.json`, and a new fixture gets its `.json` on its first run. Read each one against the spec before committing, since a wrong `.json` locks a bug in.
- **Keep private code out of git.** `apps/playground/local-examples/` and untracked `.tasks/` folders can hold sketches of private repositories. Committed specs, fixtures and examples use invented models.
- **Git.** Commit only when asked, and branch first if you are on `main`. "Push" means fast-forward `main` to the commit and push `origin main`. Don't open a pull request. A commit message is `type: What changed, so <why it matters>.`, then a body saying what changed in each package and how it was checked. See `git log -3`.
- **Write like the existing docs.** Short sentences, plain words, and the reason after "so" or "since".

## Keep the agent docs current

`.agents-docs/` belongs to the agents who work here: you add to it and fix it without asking. Update it in the same change when:

- a command, path or tool it names stops working or moves;
- you learned something the hard way that the next agent would otherwise have to rediscover, such as a tool, a flag, a workaround or a trap;
- the code changes in a way a doc describes.

How to write them is in [.agents-docs/README.md](.agents-docs/README.md#maintaining-these-docs). Run `node .agents-docs/check.mjs` after editing them.
