# Sketch: readable pseudocode for code review

Oct 22, 2026 · @Walid Lezzar

## Purpose and core contract

Sketch is a pseudocode format for reviewing code. Logic is written freely, and every interaction with the outside world is marked so a reviewer can find it at a glance.

The core contract is **loose about logic, strict about effects**. A sketch may merge, reorder or drop internal steps such as loops, mapping, null checks and logging. It may never hide, merge or reorder an effect, meaning anything that reads or changes state outside the running process.

Three principles keep the format small. **Free words:** there is no keyword list; block headers, conditions and summaries use whatever words fit. **One marker form:** anything the tool should highlight or parse, beyond calls and bindings, is written as a `::kind:value` tag, with no shorthands. **One extension point:** a new kind is just a new tag, so it needs no change to the grammar, and a renderer can give it its own color.

Sketches live in fenced code blocks tagged `sketch`, so any editor or chat client with the grammar installed can highlight them.

## Line structure

A sketch is a list of lines nested by indentation. Each line mixes free prose and real code however the writer likes; only the forms below are recognized.

| Element | Form | Meaning |
| --- | --- | --- |
| Signature | `name(params):` as the first line | Names the function the sketch describes. Its parameters become tracked variables. A `::src` tag on it names the source file. |
| Block | A line followed by deeper-indented lines | Opens a block; the deeper-indented lines belong to it. Header words are free: `if`, `for each`, `in parallel`, `if that fails`. Ending the header with `:` is a convention. |
| Call | `name(args)` or `obj.name(args)` | A reference to real code. Use `…` to elide arguments that don't matter. |
| Binding | `name = …` at the start of a line | Names a value. The name becomes a tracked variable. |
| Tag | `::kind:value`, see Markers | Effects, failures, labels and anything else worth highlighting. The only marker syntax. |
| Note | `[free text]` attached to a tag, as in `::write:redis[5 min ttl]` | Free-text details about that tag, such as a timeout or an access pattern. `[!…]` flags a danger. |
| Prose | Everything else, including brackets not attached to a tag | Logic, intent, invariants and summaries of several source lines. |

Indentation must be consistent within a sketch, at 2 or 4 spaces per level. By convention, a plain-language summary of the function's purpose may follow the signature.

```sketch
get_profile(user_id):
    cached = cache.get(user_id)    ::read:redis[lookup by key]
    if cached:
        return cached
    else:
        row = load_user(user_id)   ::read:postgres.users[lookup by key]
        ::fail:NotFound if no row
        cache.set(user_id, row)    ::write:redis[5 min ttl]
        return row
```

## Markers

Every marker is a tag: `::kind`, optionally followed by `:value` and an attached `[note]`. The kind says what the marker means, the value says what it points at, and the note adds details in free words. There are no shorthands; anything the tool should highlight is written as a tag.

| Tag | Meaning |
| --- | --- |
| `::read:sys` | Reads state outside the process without changing it. |
| `::write:sys` | Changes state outside the process. |
| `::read?:sys` | A read that happens only under a condition the sketch doesn't show. |
| `::write?:sys` | A write that happens only under a hidden condition, as in `get_or_create`. |
| `::fail:Name` | The flow ends abnormally with this outcome. The condition follows in prose. |
| `::untrusted:name` | Labels a variable as outside input that hasn't been validated. |
| `::secret:name` | Labels a variable as sensitive: passwords, tokens, personal data. |
| `::danger[note]` | Flags something on the line a reviewer should stop at. |
| `::unsure[note]` | The author isn't sure the line is accurate. |
| `::src[location]` | Links the line to its source. With a call name as value, `::src:name[location]` links that call to its definition. |

Any other kind is valid, such as `::todo[ask about retries]` or `::lock:token-refresh`. The spec sets default colors for the kinds above and renders others as a neutral pill; renderers may let users give any kind its own color.

### Systems: what is touched

The system is any name: `postgres`, `stripe`, `legacy-billing`. A dot narrows it to a part, such as `postgres.orders`, `s3.reports` or `kafka.order-paid`. The system `*` means the target is decided at runtime, as in `::write:*` for an agent running arbitrary tools.

### Notes

A note attached to a tag, with no space, describes it in free words. Access patterns go here: `::read:postgres.orders[lookup by key]`, `::read:postgres.items[n x lookup by key]`, `::read:postgres.orders[!full scan]`. A note starting with `!` flags a danger the reviewer should stop at: `::write:stripe[!no idempotency key]`. A danger that belongs to the whole line rather than one effect is its own tag: `::danger[shared across tenants]`.

Brackets that aren't attached to a tag are plain prose, so code such as `messages = [task]` needs no escaping. The one note that isn't free words is the note of `::src`, which holds a location; see Source links.

### Direction

Read or write depends on whether outside state changes, not on the protocol or verb. A model call is a POST that changes nothing, so it is a read. An OAuth refresh rotates the token at the provider, so it is a write.

### Modifiers and uncertainty

Modifiers describe the action, so they sit right after the kind. `::read?:sys` and `::write?:sys` mark an effect that happens only under a hidden condition; `::read~:sys` and `::write~:sys` mark an effect that is unverified. Doubt about a detail goes into the note's words, as in `[!full scan, probably]`. Use `::unsure[…]` for doubt about a whole line.

### Placement

A tag starts at the beginning of a line or after whitespace, so paths in real code such as `std::io` or `Vec::new()` stay plain text. A note belongs to the tag it touches. Tags can sit anywhere in a line, and a line can carry several, in execution order: `stream it ::read:s3 ::write:gcs`.

### Source links

`::src` links a sketch to the code it describes. Its note holds a location instead of free words: `path:start-end`, `path:line`, `path`, or a bare line or range.

Without a value, `::src` gives the source of the line it sits on, as in `::src[app/profile.py:12-24]`. A location without a path uses the file named on the signature, so other lines can write `::src[13]`. A line without `::src` uses its parent block's range, so a sketch can anchor every line, only its blocks or just its signature.

With a call name as its value, `::src` gives that call's definition, as in `::src:load_user[app/users.py:88]`. It applies to every call of that name in the sketch, wherever the tag sits. By convention these tags go at the end of the sketch.

```sketch
get_profile(user_id):                    ::src[app/profile.py:12-24]
    cached = cache.get(user_id)          ::read:redis[lookup by key] ::src[13]
    if cached:
        return cached
    else:                                ::src[16-23]
        row = load_user(user_id)         ::read:postgres.users[lookup by key]
        ::fail:NotFound if no row
        cache.set(user_id, row)          ::write:redis[5 min ttl]
        return row
    ::src:load_user[app/users.py:88]
    ::src:cache.set[lib/cache.py:31]
```

Renderers hide `::src` tags and turn them into links. In plain text they add clutter, so a tool posting a sketch where nothing renders can leave them out.

## Grammar

The grammar covers only tags, notes, calls, bindings and blocks; any other text is prose. Written in EBNF:

```ebnf
name       = alnum , { alnum | "-" | "_" } ;
value      = name , { "." , name } | "*" ;
modifier   = "?" | "~" ;
note       = "[" , [ "!" ] , text-without-"]" , "]" ;

tag        = "::" , name , { modifier } , [ ":" , value ] , [ note ] ;

call       = name , { "." , name } , "(" , text , ")" ;
binding    = line-start , name , "=" ;
block      = line followed by a deeper-indented line ;
```

A value is a system, a variable, a failure name or a call name, depending on the kind.

Position resolves the edge cases. A tag starts at the beginning of a line or after whitespace. A note belongs to the tag it touches; brackets anywhere else are prose. A block header may end in `:`, but its deeper-indented lines are what make it a block.

## Authoring rules

These rules apply to anyone writing a sketch, human or AI. The first two carry the contract; the rest keep sketches useful.

| Rule | What it means |
| --- | --- |
| Mark every effect where it happens | Any line that reads or changes outside state carries a tag, whether it is prose or a call. Effects inside a called function are tagged on the call. |
| Keep effects separate and in order | One tag per effect, in execution order. Never fold several effects into untagged words like "undo both". |
| Name the failures the function raises or handles | Each one is `::fail:Name`, with its condition in prose. Failures from callees that simply propagate need no tag. A swallowed failure is noted on its effect, as in `::write:sendgrid[failure ignored]`. |
| Anchor what a reviewer may open | Use real function names for calls worth jumping to. Write everything else as prose. When the source is known, link lines and calls with `::src`. |
| Use prose for intent | Invariants, purposes and summaries go in plain words, such as "only one refresh at a time". |
| Flag doubt instead of guessing | Add `~` or `::unsure[…]` when a claim isn't verified. When a detail like an access pattern is a guess, say "probably" in its note. |
| Flag dangers | Start a note with `!` where a reviewer should stop, as in `::write:stripe[!no idempotency key]` or `::read:postgres.orders[!full scan]`. Use `::danger[…]` for a danger that belongs to the whole line. |
| Label data worth tracking | Add `::untrusted` where outside input enters and `::secret` for sensitive values. |
| Leave out observability | Omit logs, metrics and traces, unless they are a requirement like an audit log or labeled data flows into them. A kept log is an effect and gets a tag, such as `::write:logs`. |

## Rendering

A highlighter works only from tags, the shape of calls and bindings, and position, so it needs no vocabulary. Five colors are always on: violet, blue, aqua, orange and red, plus amber for dangers.

| Element | Rendering |
| --- | --- |
| Read tag | Aqua pill |
| Write tag | Orange pill |
| Conditional modifier (`?`) | Dashed outline in the effect's color |
| Unverified modifier (`~`) | Lighter fill, with the `~` kept visible |
| Runtime system (`*`) | Dashed outline, so it stands out |
| Note attached to a tag | Muted text right after the pill |
| Danger note `[!…]` or `::danger` tag | Amber |
| Failure tag | Red; the rest of the line stays normal |
| Call | Blue with a dotted underline; linked to its definition when a `::src` tag gives it |
| First word of a prose line or block header | Violet |
| Binding or parameter | Bold; colored across all its uses on hover or click |
| Labeled variable | Persistent underline in the label's color |
| Other kinds | Neutral pill, unless the renderer assigns a color |
| `::src` tag | Hidden; the line links to its source, and calls link to their definitions |
| Tag at the end of a line | Aligned into a right-hand tag column, with its note |

Colors are defined for both light and dark themes.

## Examples

Each example below surfaces at least one issue a reviewer would catch from the sketch alone.

### Signup: labels and conditional writes

```sketch
signup(request):
    body = request.json()                 ::untrusted:body
    ::fail:InvalidEmail if body.email is malformed
    user = get_or_create(body.email)      ::write?:postgres.users
    ::fail:AlreadyExists if user is verified
    hash = bcrypt(body.password)          ::secret:hash
    set_password(user, hash)              ::write:postgres.users
    send_verification(user)               ::write:sendgrid
    log_event("signup", body)             ::write:logs
```

The untrusted `body` flows into the log write, so the plain-text password gets logged. The conditional write also raises a question: for an existing unverified user, anyone signing up with that email overwrites the password.

### Order search: access patterns

```sketch
search_orders(user_id, term):
    user = get_user(user_id)          ::read:postgres.users[lookup by key]
    orders = recent_orders(user)      ::read:postgres.orders[range on created_at]
    if a term is given:
        filter orders by note text    ::read:postgres.orders[!full scan]
    for each order:
        items = get_items(order.id)   ::read:postgres.items[!n x lookup by key]
    count orders by status            ::read:postgres.orders[!full scan, probably]
```

The notes say how each query touches the table, in the author's own words. `get_items` runs once per order, which the author writes as "n x". The status count says "probably" because it depends on indexes the author hasn't seen.

### Trip booking: failure blocks

```sketch
book_trip(trip, card):
    seat = hold_seat(trip.flight)           ::write:airline-api
    room = reserve_room(trip.hotel)         ::write:hotel-api
    if that fails:
        release_seat(seat)                  ::write:airline-api
        ::fail:BookingFailed
    charge(card, trip.total)                ::write:stripe
    if that fails:
        cancel_room(room)                   ::write:hotel-api
        release_seat(seat)                  ::write:airline-api
        ::fail:PaymentFailed
    save_booking(trip, seat, room)          ::write:postgres.bookings
```

The final write has no failure block. If saving fails after the charge succeeds, the customer pays and gets no booking.

### Agent loop: effects decided at runtime

```sketch
run_agent(task):
    messages = [task]
    repeat up to 20 turns:
        reply = claude.create(messages, tools)  ::read:anthropic
        if no tool calls, return reply.text
        for each tool call, in parallel:
            run_tool(call)                      ::write:*
        append results to messages
    ::fail:TooManyTurns
```

The `::write:*` line is where review attention belongs: what the agent can touch depends on which tools it is given.

## Changes and open questions

These changes make the format consistent with what was sketched in discussion, and remove syntax that collided with real code.

| Change | Before | Now | Why |
| --- | --- | --- | --- |
| One marker form | Arrows, `!` and `::` tags were separate syntaxes | Every marker is a `::kind:value` tag, with no shorthands | One rule for parsers, and no collisions with code such as `!cached` or `$user->save()`. Shorthands can return later as sugar without breaking sketches |
| Meaning of `?` | Meant both "conditional" (`-?>`) and "unverified" (`:scan?`) | `?` means conditional only; `~` means unverified | One symbol, one meaning |
| Modifier position | `?` inside the arrow, `~` at the end | Modifiers follow the kind: `::write?:sys`, `::read~:sys` | Modifiers describe the action, so they sit next to it |
| Access patterns | `:key`, `:range` and `:scan` qualifiers | Free-text notes attached to the tag | No hidden vocabulary, and notes can say more |
| Dangers | Only scans were flagged | `[!…]` on any tag, or `::danger[…]` for a whole line | Any warning can be flagged |
| Failure names | `! free text`, with no clear end to the name | `::fail:Name`, with the condition in prose | The name has a clear end |
| Failures to name | Every abnormal exit | Only failures the function raises or handles | Propagated failures would put a tag on nearly every call |
| Conditional reads | Only writes could be conditional | `::read?:sys` added | Symmetry with `::write?` |
| Parts of a system | Not specified | A dot narrows the system: `postgres.orders` | Reviewers often need to know which table |
| Tags on prose lines | Only on calls | On any line | A prose summary must never hide an effect |
| Repeated calls | The renderer added `×n` to key lookups inside loops | Authors write "n x" in a note | Removes the spec's only heuristic |
| Blocks | A line ending in `:` | A line followed by deeper-indented lines; the colon is a convention | A block header can carry a tag |
| Free text | `::unsure:"…"` took a quoted value, and `[…]` after a space was a note on the line | Free text goes only in a note attached to a tag, and the value is optional: `::unsure[…]`. Other brackets are prose | One free-text syntax, and code such as `messages = [task]` is no longer read as a note |
| Variable links | `::var:name` linked a prose mention to a variable | Removed | Every use of a binding is already highlighted |
| Logs | A kept log line carried no tag | A kept log is tagged, as in `::write:logs` | The contract never hides an effect |
| Kind colors | Fixed by the spec | The spec sets defaults; renderers may style any kind | Teams can highlight their own kinds without a spec change |
| Source anchoring | Each line linked to a range of source lines, with no syntax for it | `::src` gives a line's source or a call's definition | Links use the same tag mechanism, with no grammar change |

| Open question | Current default |
| --- | --- |
| Which revision of the code `::src` line numbers refer to | Left to the tool that generates the sketch |
| How a pull request's changes show up in a sketch (diff mode) | Not designed yet |
| Zoom levels: one line, block level, near source | Block level only |
| Whether model calls need their own kind, for cost and nondeterminism | Treated as reads |
| Whether shorthands such as `->sys` come back as sugar for tags | Tags only |
| A final name for the format | "Sketch" is a working name |
