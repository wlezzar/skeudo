# Sketch: readable pseudocode for code review

Oct 22, 2026 · @Walid Lezzar

## Purpose and core contract

Sketch is a pseudocode format for reviewing code. Logic is written freely, and every interaction with the outside world is marked so a reviewer can find it at a glance.

The core contract is **loose about logic, strict about effects**. A sketch may merge, reorder or drop internal steps such as loops, mapping, null checks and logging. It may never hide, merge or reorder an effect, meaning anything that reads or changes state outside the running process.

Three principles keep the format small. **Fixed punctuation, free words:** only markers carry meaning; everything else is prose or code-like text, with no keyword list. **One extension point:** every marker is a `::kind:value` tag, so a new kind needs no change to the grammar. **Anchored to source:** each line maps to a range of source lines, and real function names link to their definitions.

Sketches live in fenced code blocks tagged `sketch`, so any editor or chat client with the grammar installed can highlight them.

## Line structure

A sketch is a list of lines nested by indentation. Each line mixes free prose and real code however the writer likes; only the forms below are recognized.

| Element | Form | Meaning |
| --- | --- | --- |
| Signature | `name(params):` as the first line | Anchors the sketch to a function. Its parameters become tracked variables. |
| Block | Any line ending in `:` | Opens a block; deeper-indented lines below belong to it. Header words are free: `if`, `for each`, `in parallel`, `if that fails`. |
| Call | `name(args)` or `obj.name(args)` | A reference to real code, linked to its definition. Use `…` to elide arguments that don't matter. |
| Binding | `name = …` at the start of a line | Names a value. The name becomes a tracked variable. |
| Note | `[free text]` after a space, or attached to a marker as `->sys[free text]` | Free-text details such as a timeout or an access pattern. After a space it describes the line; attached, it describes that effect. `[!…]` flags a danger. |
| Marker | See Markers | Effects, failures and labels. The only parsed syntax inside a line. |
| Prose | Everything else | Logic, intent, invariants and summaries of several source lines. |

Indentation must be consistent within a sketch, at 2 or 4 spaces per level. By convention, a plain-language summary of the function's purpose may follow the signature.

```sketch
get_profile(user_id):
    cached = cache.get(user_id)    <-redis[lookup by key]
    if cached:
        return cached
    else:
        row = load_user(user_id)   <-postgres.users[lookup by key]
        !NotFound if no row
        cache.set(user_id, row)    ->redis[5 min ttl]
        return row
```

## Markers

Every marker has one canonical form, `::kind:value`. The most frequent kinds also have a shorthand, which is what people usually write.

| Shorthand | Canonical | Meaning |
| --- | --- | --- |
| `<-sys` | `::read:sys` | Reads state outside the process without changing it. |
| `->sys` | `::write:sys` | Changes state outside the process. |
| `<-?sys` | `::read?:sys` | A read that happens only under a condition the sketch doesn't show. |
| `->?sys` | `::write?:sys` | A write that happens only under a hidden condition, as in `get_or_create`. |
| `!Name` | `::fail:Name` | The flow ends abnormally with this outcome. The condition follows in prose. |
| none | `::var:name` | Links a prose mention to a tracked variable. |
| none | `::untrusted:name` | Labels a variable as outside input that hasn't been validated. |
| none | `::secret:name` | Labels a variable as sensitive: passwords, tokens, personal data. |
| none | `::unsure:"note"` | The author isn't sure the line is accurate. |

Any other kind is valid and renders as a neutral pill. A kind earns its own color or shorthand only when reviewers need to spot it while scanning.

### Systems: what is touched

The system is any name: `postgres`, `stripe`, `legacy-billing`. A dot narrows it to a part, such as `postgres.orders`, `s3.reports` or `kafka.order-paid`. The system `*` means the target is decided at runtime, as in `->*` for an agent running arbitrary tools.

### Notes on markers

A note attached to a marker, with no space, describes that effect in free words. Access patterns go here: `<-postgres.orders[lookup by key]`, `<-postgres.items[n x lookup by key]`, `<-postgres.orders[!full scan]`. A note starting with `!` flags a danger the reviewer should stop at, on any marker: `->stripe[!no idempotency key]`.

### Direction

Read or write depends on whether outside state changes, not on the protocol or verb. A model call is a POST that changes nothing, so it is a read. An OAuth refresh rotates the token at the provider, so it is a write.

### Modifiers and uncertainty

Modifiers describe the action, so they sit right after the arrow. `->?sys` and `<-?sys` mark an effect that happens only under a hidden condition; `->~sys` and `<-~sys` mark an effect that is unverified. In canonical form the modifier follows the kind: `::write?:sys`, `::read~:sys`. Doubt about a detail goes into the note's words, as in `[!full scan, probably]`. Use `::unsure:"…"` for doubt about a whole line.

### Attachment and placement

Attachment decides what belongs to what. A marker is attached to the word after it: `->stripe`, `!NotFound`, `::secret:hash`. A note attached to a marker belongs to that effect; after a space it belongs to the line. A detached `->` or `!` followed by a space is plain text, which is also how prose escapes them. Markers can sit anywhere in a line; mid-sentence they read as "from" and "to", as in `stream it <-s3 ->gcs`.

## Grammar

The grammar covers only markers, calls, bindings, blocks and notes; any other text is prose. Written in EBNF:

```ebnf
name       = alnum , { alnum | "-" | "_" } ;
system     = name , { "." , name } | "*" ;
modifier   = "?" | "~" ;
note       = "[" , [ "!" ] , text-without-"]" , "]" ;

read       = "<-" , { modifier } , system , [ note ] ;
write      = "->" , { modifier } , system , [ note ] ;
fail       = "!" , name ;
tag        = "::" , name , { modifier } , ":" , ( system | quoted ) , [ note ] ;

call       = name , { "." , name } , "(" , text , ")" ;
binding    = line-start , name , "=" ;
block      = line whose last non-space character is ":" ;
line-note  = space , note ;
```

Position resolves the edge cases. A note touching a marker belongs to that effect, while a note after a space belongs to the line. A colon at the end of a line closes a block header. A `!` followed by `=` or a space is plain text, so `x != y` needs no escaping.

## Authoring rules

These rules apply to anyone writing a sketch, human or AI. The first two carry the contract; the rest keep sketches useful.

| Rule | What it means |
| --- | --- |
| Mark every effect where it happens | Any line that reads or changes outside state carries a marker, whether it is prose or a call. Effects inside a called function are tagged on the call. |
| Keep effects separate and in order | One marker per effect, in execution order. Never fold several effects into unmarked words like "undo both". |
| Name every failure | Every abnormal exit is `!Name`, with its condition in prose. A swallowed failure is noted as `[failure ignored]`. |
| Anchor what a reviewer may open | Use real function names for calls worth jumping to. Write everything else as prose. |
| Use prose for intent | Invariants, purposes and summaries go in plain words, such as "only one refresh at a time". |
| Flag doubt instead of guessing | Add `~` or `::unsure` when a claim isn't verified. When a detail like an access pattern is a guess, say "probably" in its note. |
| Flag dangers in notes | Start a note with `!` where a reviewer should stop, as in `->stripe[!no idempotency key]` or `<-postgres.orders[!full scan]`. |
| Label data worth tracking | Add `::untrusted` where outside input enters and `::secret` for sensitive values. |
| Leave out observability | Omit logs, metrics and traces, unless they are a requirement like an audit log or labeled data flows into them. |

## Rendering

A highlighter works only from markers and position, so it needs no vocabulary. Five colors are always on: violet, blue, aqua, orange and red, plus amber for danger notes.

| Element | Rendering |
| --- | --- |
| Read marker | Aqua pill |
| Write marker | Orange pill |
| Conditional modifier (`?`) | Dashed outline in the effect's color |
| Unverified modifier (`~`) | Lighter fill, with the `~` kept visible |
| Runtime system (`*`) | Dashed outline, so it stands out |
| Note attached to a marker | Muted text right after the pill |
| Danger note `[!…]` | Amber, attached or standalone |
| Standalone note `[…]` | Muted text |
| Failure name | Red; the rest of the line stays normal |
| Call | Blue with a dotted underline, linked to its definition |
| First word of a prose line or block header | Violet |
| Binding or parameter | Bold; colored across all its uses on hover or click |
| Labeled variable | Persistent underline in the label's color |
| Unknown `::kind` | Neutral pill |
| Marker at the end of a line | Aligned into a right-hand tag column, with its note |

Each line links to its source range, so tapping it jumps to the code. Colors are defined for both light and dark themes.

## Examples

Each example below surfaces at least one issue a reviewer would catch from the sketch alone.

### Signup: labels and conditional writes

```sketch
signup(request):
    body = request.json()                 ::untrusted:body
    !InvalidEmail if body.email is malformed
    user = get_or_create(body.email)      ->?postgres.users
    !AlreadyExists if user is verified
    hash = bcrypt(body.password)          ::secret:hash
    set_password(user, hash)              ->postgres.users
    send_verification(user)               ->sendgrid
    log_event("signup", body)
```

The untrusted `body` flows into `log_event`, so the plain-text password gets logged. The conditional write also raises a question: for an existing unverified user, anyone signing up with that email overwrites the password.

### Order search: access patterns

```sketch
search_orders(user_id, term):
    user = get_user(user_id)          <-postgres.users[lookup by key]
    orders = recent_orders(user)      <-postgres.orders[range on created_at]
    if a term is given:
        filter orders by note text    <-postgres.orders[!full scan]
    for each order:
        items = get_items(order.id)   <-postgres.items[!n x lookup by key]
    count orders by status            <-postgres.orders[!full scan, probably]
```

The notes say how each query touches the table, in the author's own words. `get_items` runs once per order, which the author writes as "n x". The status count says "probably" because it depends on indexes the author hasn't seen.

### Trip booking: failure blocks

```sketch
book_trip(trip, card):
    seat = hold_seat(trip.flight)           ->airline-api
    room = reserve_room(trip.hotel)         ->hotel-api
    if that fails:
        release_seat(seat)                  ->airline-api
        !BookingFailed
    charge(card, trip.total)                ->stripe
    if that fails:
        cancel_room(room)                   ->hotel-api
        release_seat(seat)                  ->airline-api
        !PaymentFailed
    save_booking(trip, seat, room)          ->postgres.bookings
```

The final write has no failure block. If saving fails after the charge succeeds, the customer pays and gets no booking.

### Agent loop: effects decided at runtime

```sketch
run_agent(task):
    messages = [task]
    repeat up to 20 turns:
        reply = claude.create(messages, tools)  <-anthropic
        if no tool calls, return reply.text
        for each tool call, in parallel:
            run_tool(call)                  ->*
        append results to messages
    !TooManyTurns
```

The `->*` line is where review attention belongs: what the agent can touch depends on which tools it is given.

## Changes and open questions

Ten changes make the format consistent with what was sketched in discussion.

| Change | Before | Now | Why |
| --- | --- | --- | --- |
| One canonical form | Arrows, `!` and `::` tags were separate syntaxes | Every marker is `::kind:value`; arrows and `!` are shorthand | One rule for parsers; new kinds need no grammar change |
| Meaning of `?` | Meant both "conditional" (`-?>`) and "unverified" (`:scan?`) | `?` means conditional only; `~` means unverified | One symbol, one meaning |
| Modifier position | `?` inside the arrow, `~` at the end | Modifiers sit right after the arrow: `->?`, `<-?`, `<-~` | Modifiers describe the action, so they sit next to it |
| Access patterns | `:key`, `:range` and `:scan` qualifiers | Free-text notes attached to the marker | No hidden vocabulary, and notes can say more |
| Dangers | Only scans were flagged | `[!…]` flags a danger on any marker or line | One mechanism for every warning |
| Failure names | `! free text`, with no clear end to the name | `!Name` attached; condition in prose | Same attachment rule as `<-redis` |
| Conditional reads | Only writes could be conditional | `<-?sys` added | Symmetry with `->?` |
| Parts of a system | Not specified | A dot narrows the system: `postgres.orders` | Reviewers often need to know which table |
| Tags on prose lines | Only on calls | On any line | A prose summary must never hide an effect |
| Repeated calls | The renderer added `×n` to key lookups inside loops | Authors write "n x" in a note | Removes the spec's only heuristic |

| Open question | Current default |
| --- | --- |
| How a pull request's changes show up in a sketch (diff mode) | Not designed yet |
| Zoom levels: one line, block level, near source | Block level only |
| Whether model calls need their own kind, for cost and nondeterminism | Treated as reads |
| A final name for the format | "Sketch" is a working name |
