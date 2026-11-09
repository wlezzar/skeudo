---
name: skeudo
description: Write a Skeudo sketch, readable pseudocode for code review where every outside effect is tagged, for a function, a file, a commit or a pull request. Use when the user asks to "sketch" code, to explain a commit, PR or flow as pseudocode, or for a reviewable summary of what code reads and writes (databases, APIs, storage, queues, devices).
---

# Skeudo

A sketch is pseudocode for code review. Logic is written freely; every interaction with the outside world is tagged so a reviewer finds it at a glance.

The contract: **loose about logic, strict about effects.** You may merge, reorder or drop internal steps (loops, mapping, null checks, logging). You may never hide, merge or reorder an effect: anything that reads or changes state outside the running process.

## Syntax

Sketches go in fenced code blocks tagged `skeudo`. Lines nest by indentation, 4 spaces per level.

| Element | Form | Notes |
| --- | --- | --- |
| Signature | `name(params):` on the first line | Real function name, plain parameter names. Optional: a hook or handler can start with a prose line. |
| Block | A line followed by deeper-indented lines | Header words are free: `if`, `for each`, `in one transaction:`, `if that fails:`. |
| Call | `name(args)`, `obj.name(args)` | Only for real functions a reviewer may open. Use `…` for arguments that don't matter. The `)` must be on the same line. |
| Binding | `name = …` at the start of a line | Plain names only. Every later use of the name is highlighted. |
| Tag | `::kind`, `::kind:value`, `::kind:value[note]` | The only marker syntax. Starts at the beginning of a line or after whitespace. |
| Prose | Everything else | Intent, conditions, summaries of several source lines. |

| Tag | Use it for |
| --- | --- |
| `::read:sys` | Reads outside state without changing it. |
| `::write:sys` | Changes outside state. |
| `::read?:sys`, `::write?:sys` | The effect happens only under a condition the sketch doesn't show. |
| `::read~:sys`, `::write~:sys` | You haven't verified the effect. |
| `::fail:Name` | The function raises or handles this failure. Write its condition as an `if …:` block around it, as in the example below. |
| `::untrusted:var`, `::secret:var` | Labels a variable: unvalidated outside input, or sensitive data. |
| `::danger[note]` | Something on the line a reviewer should stop at. |
| `::unsure[note]` | You aren't sure the line is accurate. |
| `::src[location]`, `::src:call[location]` | Links a line to its source, or a call to its definition. |
| `::repo[url]` | Names the repository and commit that `::src` paths and lines refer to. See step 5. |
| `::doc[…]`, `::doc:call[…]` | Explains a line, or a call whose name doesn't say what it does. Renderers show it on hover. See step 4. |
| `::new`, `::changed[was …]`, `::removed` | What a commit or pull request did to the line. See step 6. |
| `::anything[note]` | Any other kind is valid and renders as a neutral pill. |

- **Systems** are free names: `postgres`, `stripe`, `redis`. A dot names the part: `postgres.orders`, `s3.reports`. `*` means decided at runtime.
- **Notes** attach to a tag with no space: `::read:postgres.orders[lookup by key]`. Access patterns, timeouts and counts go here (`[n x lookup by key]`). A note starting with `!` is a danger: `::write:stripe[!no idempotency key]`. A note can't contain `]`.
- **Direction** depends on whether outside state changes, not on the verb. A model call is a read; an OAuth refresh that rotates a token is a write.
- **Several tags** on a line go in execution order. Tags at the end of a line are aligned into a column by renderers, so pad them to a common column.

## Workflow

1. **Scope.**
   - For a function or file, sketch each public function that has effects.
   - For a commit or PR (`git show --stat <rev>`, then the diff), sketch the flows the change affects, in the order data moves (for example the server, then the client).
   - Skip pure plumbing such as types, mappers and passing a new field through. Mention it in one sentence instead.
2. **Read the full code, not just the hunks.** Open each function at the revision you're sketching. Follow calls until you know what they touch. An effect inside a callee is tagged on the call. Find the real table, bucket, queue and service names (schema files, clients, config). If you can't verify an effect, mark it `~`.
3. **Decide what is an effect.**
   - Effects: databases, caches, queues, object storage, files, HTTP and RPC calls (including to your own backend from a client), email, third-party APIs, model calls, and devices such as the microphone or camera.
   - Not effects: in-memory and UI state, timers, local child processes that only compute (such as ffmpeg transcoding a stream), and logging.
   - When unsure, tag it and add `::unsure[…]`. A spurious tag is cheap, a hidden effect breaks the contract.
4. **Write each sketch.**
   - Signature, then a one-line summary of the purpose.
   - One line per meaningful step, in prose or as real calls.
   - Collapse internal detail into prose, but give every effect its own tagged line, in execution order.
   - Name the failures the function raises or handles with `::fail`, inside an `if …:` block for their condition. Failures from callees that just propagate need no tag.
   - Explain what a name doesn't say. When a reviewer couldn't guess what a call does from its name, add `::doc:name[…]` at the end of the sketch, before the `::src` tags, as in `::doc:hydrate[loads the user's teams and settings onto the row]`. Write the name as the call is written: `::doc:cache.set[…]` for `cache.set(…)`. When a line's code is hard to follow, put `::doc[…]` at the end of it, before its `::src`; on a block header it explains the block. Keep it to a phrase, and skip calls and lines that already say what they do.
   - An explanation stays hidden until a reader hovers over it, so it never holds an effect or a danger. The call's line still carries its effect tags, and a danger is still `[!…]` or `::danger[…]`.
5. **Link the source.**
   - Put `::src[path:start-end]` on the signature, with the path relative to the repo root.
   - Put `::src[start-end]` on blocks and key lines. A location without a path uses the signature's file.
   - Put `::src:name[path:line]` at the end of the sketch for calls a reviewer may open.
   - End the sketch with `::repo[git+<remote>@<commit>]`, so its links work wherever the sketch is saved or read. Write the remote as `https://<host>/<owner>/<repo>`, whatever form `git remote get-url origin` prints: `git@github.com:org/shop.git` becomes `https://github.com/org/shop`. The commit is the one you sketched, from `git rev-parse --short HEAD` or the PR's head commit. With no remote, write `git+file://<absolute path of the repo>@<commit>`. Leave out `@<commit>` when sketching uncommitted work.
   - Line numbers refer to that commit. Get them with `grep -n` or `git show <rev>:<path> | grep -n …`.
6. **Mark changes (commits and PRs only).**
   - Sketch the code as it is after the change. `::src` locations refer to that revision, so `::repo` names the commit after the change.
   - Tag what changed: `::new` on a line the change adds, `::changed[was …]` on a line whose behavior changed, and `::removed` on a line describing behavior that is gone, kept where it used to run.
   - `::new` or `::removed` on a block header covers the whole block, so don't repeat it on the lines inside. A line inside can still carry its own tag, such as `::changed[…]` on a line moved into a new block.
   - `::changed` always gets a note saying how. `::changed` on a block header covers only that line.
   - A removed line keeps its effect tags, so the reviewer sees the effects the code no longer has.
   - Put change tags after the line's effect tags and before its `::src` tags.
   - Unchanged lines carry no change tag. Keep the ones needed to follow the flow.
7. **Review your own sketch.** If the `skeudo` command is installed, run `skeudo check doc.md`, or pipe the document to `skeudo check`, and fix every warning it prints. Then go through the checklist below, and write down what a reviewer should check.

## Output

Return a Markdown document:

````markdown
# <what was sketched>, at <revision>

<two or three sentences: what the code or the change does>

## <flow name>

<one sentence of context>

```skeudo
...
```

## What a reviewer should check

- <issue or question, pointing at the line that shows it>
````

Each item in the last section should be something the sketches make visible: an effect without a failure path, an order of writes that can leave state inconsistent, labeled data reaching a log, a missing idempotency key, an assumption nothing enforces. Say "probably" when you haven't verified it. If the user wants to see it rendered, save the document as a `.md` file; the Skeudo playground and VS Code's Markdown preview, with the Skeudo extension, render Markdown with skeudo fences, and `skeudo render doc.md -o doc.html` writes a standalone HTML page.

## Checklist

- Every line that reads or changes outside state carries a tag, including prose lines.
- No effect hides in words like "save and notify" or "clean up": one tag per effect, in order.
- Read and write chosen by state change; hidden conditions marked `?`; unverified effects marked `~`; guesses say "probably".
- Untrusted input and secrets are labeled where they enter.
- In a sketch of a change, every added, altered or removed behavior carries a change tag, and every `::changed` has a note.
- Indentation is 4 spaces per level; calls close on the same line; notes contain no `]`.
- Calls are real names a reviewer can open; everything else is prose.
- Calls whose names don't say what they do have a `::doc:name[…]`, and no effect or danger appears only in a `::doc`.
- Each sketch with `::src` links ends with `::repo`, naming the repository and the commit sketched.

## Example

```skeudo
get_profile(user_id):                    ::src[app/profile.py:12-24]
    Returns a user's profile, cached for 5 minutes.
    cached = cache.get(user_id)          ::read:redis[lookup by key] ::src[13]
    if cached:
        return cached
    else:                                ::src[16-23]
        row = load_user(user_id)         ::read:postgres.users[lookup by key]
        if no row:
            ::fail:NotFound
        cache.set(user_id, row)          ::write:redis[5 min ttl]
        return row
    ::src:load_user[app/users.py:88]
    ::repo[git+https://github.com/org/shop@a1b2c3d]
```
