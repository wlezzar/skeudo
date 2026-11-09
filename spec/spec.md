# Skeudo: readable pseudocode for code review

Oct 22, 2026 · updated Nov 7, 2026 · @Walid Lezzar

## Purpose and core contract

Skeudo is a pseudocode format for reviewing code. Logic is written freely, and every interaction with the outside world is marked so a reviewer can find it at a glance.

The core contract is **loose about logic, strict about effects**. A sketch may merge, reorder or drop internal steps such as loops, mapping, null checks and logging. It may never hide, merge or reorder an effect, meaning anything that reads or changes state outside the running process.

Three principles keep the format small. **Free words:** there is no keyword list; block headers, conditions and summaries use whatever words fit. **One marker form:** anything the tool should highlight or parse, beyond calls and bindings, is written as a `::kind:value` tag, with no shorthands. **One extension point:** a new kind is just a new tag, so it needs no change to the grammar, and a renderer can give it its own color.

Sketches live in fenced code blocks tagged `skeudo`, so any editor or chat client with the grammar installed can highlight them. Renderers also accept `sketch`, the format's former working name.

## Line structure

A sketch is a list of lines nested by indentation. Each line mixes free prose and real code however the writer likes; only the forms below are recognized.

| Element | Form | Meaning |
| --- | --- | --- |
| Signature | `name(params):` as the first line | Names the function the sketch describes. Its parameters become tracked variables. A `::src` tag on it names the source file. The colon can be dropped when indented lines follow. A sketch without a signature is still valid. |
| Block | A line followed by deeper-indented lines | Opens a block; the deeper-indented lines belong to it. Header words are free: `if`, `for each`, `in parallel`, `if that fails`. Ending the header with `:` is a convention. |
| Call | `name(args)`, `obj.name(args)` or `mod::name(args)`, closed on the same line | A reference to real code. Use `…` to elide arguments that don't matter. |
| Binding | `name = …` at the start of a line | Names a value. The name becomes a tracked variable. Only a plain name binds, so `order.status = paid` and `a == b` are not bindings. |
| Tag | `::kind:value`, see Markers | Effects, failures, labels and anything else worth highlighting. The only marker syntax. |
| Note | `[free text]` attached to a tag, as in `::write:redis[5 min ttl]` | Free-text details about that tag, such as a timeout or an access pattern. `[!…]` flags a danger. |
| Prose | Everything else, including brackets not attached to a tag | Logic, intent, invariants and summaries of several source lines. |

Indentation must be consistent within a sketch, at 2 or 4 spaces per level. The first indented line sets the unit, and a tab counts as 4 spaces. A sketch indented as a whole, such as one nested in a list item, keeps its shape. By convention, a plain-language summary of the function's purpose may follow the signature.

```skeudo
get_profile(user_id):
    cached = cache.get(user_id)    ::read:redis[lookup by key]
    if cached:
        return cached
    else:
        row = load_user(user_id)   ::read:postgres.users[lookup by key]
        if no row:
            ::fail:NotFound
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
| `::fail:Name` | The flow ends abnormally with this outcome. Its condition is written as an `if …:` block around it. |
| `::untrusted:name` | Labels a variable as outside input that hasn't been validated. See Variables and labels. |
| `::secret:name` | Labels a variable as sensitive: passwords, tokens, personal data. See Variables and labels. |
| `::danger[note]` | Flags something on the line a reviewer should stop at. |
| `::unsure[note]` | The author isn't sure the line is accurate. |
| `::src[location]` | Links the line to its source. With a call name as value, `::src:name[location]` links that call to its definition. |
| `::repo[url]` | Names the repository that `::src` paths are relative to, and the revision they refer to. See Source links. |
| `::doc[text]` | Explains the line it sits on to a reader who can't tell what it does. With a call name as value, `::doc:name[text]` explains that call. See Explanations. |
| `::new` | The change being sketched adds this line. See Changes. |
| `::changed[how]` | The change being sketched alters what this line does. See Changes. |
| `::removed[what]` | The change being sketched takes this behavior away. See Changes. |

Any other kind is valid, such as `::todo[ask about retries]` or `::lock:token-refresh`. The spec sets default colors for the kinds above and renders others as a neutral pill; renderers may let users give any kind its own color.

### Systems: what is touched

The system is any name: `postgres`, `stripe`, `legacy-billing`. A dot narrows it to a part, such as `postgres.orders`, `s3.reports` or `kafka.order-paid`. The system `*` means the target is decided at runtime, as in `::write:*` for an agent running arbitrary tools.

### Notes

A note attached to a tag, with no space, describes it in free words. Access patterns go here: `::read:postgres.orders[lookup by key]`, `::read:postgres.items[n x lookup by key]`, `::read:postgres.orders[!full scan]`. A note starting with `!` flags a danger the reviewer should stop at: `::write:stripe[!no idempotency key]`. A danger that belongs to the whole line rather than one effect is its own tag: `::danger[shared across tenants]`.

Brackets that aren't attached to a tag are plain prose, so code such as `messages = [task]` needs no escaping. Two notes aren't free words: the note of `::src` holds a location, and the note of `::repo` holds a URL; see Source links.

### Direction

Read or write depends on whether outside state changes, not on the protocol or verb. A model call is a POST that changes nothing, so it is a read. An OAuth refresh rotates the token at the provider, so it is a write.

### Modifiers and uncertainty

Modifiers describe the action, so they sit right after the kind. `::read?:sys` and `::write?:sys` mark an effect that happens only under a hidden condition; `::read~:sys` and `::write~:sys` mark an effect that is unverified. Doubt about a detail goes into the note's words, as in `[!full scan, probably]`. Use `::unsure[…]` for doubt about a whole line.

### Placement

A tag starts at the beginning of a line or after whitespace, so paths in real code such as `std::io` or `Vec::new()` stay plain text. A note belongs to the tag it touches. Tags can sit anywhere in a line, and a line can carry several, in execution order: `stream it ::read:s3 ::write:gcs`.

Tags that come after everything else on a line are its trailing tags, and renderers line them up in a column. A line made only of tags, such as `::fail:BookingFailed`, has no trailing tags; its tags are the line.

### Source links

`::src` links a sketch to the code it describes. Its note holds a location instead of free words: `path:start-end`, `path:line`, `path`, or a bare line or range. Paths are relative to the root of the repository.

Without a value, `::src` gives the source of the line it sits on, as in `::src[app/profile.py:12-24]`. A location without a path uses the file named on the signature, so other lines can write `::src[13]`. A line without `::src` uses its parent block's range, so a sketch can anchor every line, only its blocks or just its signature.

With a call name as its value, `::src` gives that call's definition, as in `::src:load_user[app/users.py:88]`. It applies to every call of that name in the sketch, wherever the tag sits. By convention these tags go at the end of the sketch.

`::repo` names the repository and the revision the locations refer to. Its note holds a URL. It applies to the whole sketch, wherever it sits; by convention it goes on the last line.

```skeudo
get_profile(user_id):                    ::src[app/profile.py:12-24]
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
    ::src:cache.set[lib/cache.py:31]
    ::repo[git+https://github.com/org/shop@a1b2c3d]
```

Renderers hide `::src` and `::repo` tags and turn them into links. In plain text they add clutter, so a tool posting a sketch where nothing renders can leave them out.

The URL of `::repo` takes one of three forms:

| Form | Example | Links go to |
| --- | --- | --- |
| `git+` and a remote, then `@` and a revision | `git+https://github.com/org/shop@a1b2c3d` | A local copy of the repository when the renderer finds one, otherwise the repository's host at that revision |
| `git+file://` and an absolute path, then `@` and a revision | `git+file:///home/me/shop@a1b2c3d` | That folder |
| Any other URL | `https://code.example.com/shop/blob/a1b2c3d/` | That URL with the path added, as given |

The revision follows the last `@` in the URL's path, so the user in `git+ssh://git@github.com/org/shop.git` belongs to the remote. It can be a commit, a tag or a branch. It is optional; without one, links go to the code as it is now. Prefer the commit the sketch was written from, so its line numbers still match after the code moves on.

Two remotes name the same repository when their host and path match, ignoring the protocol, the user, the port, letter case and a trailing `.git`. So `git+ssh://git@github.com/org/shop.git` and `git+https://github.com/org/shop` are the same repository, and a renderer can find a local copy however it was cloned.

A sketch without `::repo` leaves the root to the renderer, such as the editor's workspace folder. A base the user gives for one rendering, such as a command-line option, takes precedence over `::repo`.

### Explanations

`::doc` explains something a reader can't tell from the sketch alone. Its note holds the explanation, in free words.

With a call name as its value, `::doc:name[text]` explains what that call does. It applies to every call of that name in the sketch, wherever the tag sits, and names the call as the sketch writes it, as in `::doc:cache.set[…]`. By convention these tags go at the end of the sketch, before the `::src` tags.

Without a value, `::doc[text]` explains the line it sits on. On a block header, it explains the whole block. By convention it follows the line's other tags, before `::src`.

```skeudo
settle_invoice(invoice_id):
    invoice = load_invoice(invoice_id)        ::read:postgres.invoices[lookup by key]
    if invoice is past due:                   ::doc[past the due date plus the account's grace period]
        add_late_fee(invoice)                 ::write:postgres.invoices
    remaining = apply_credits(invoice)        ::write:postgres.credits
    charge(invoice.card, remaining)           ::write:stripe
    ::doc:apply_credits[spends the oldest credits first and returns what is left to pay]
    ::doc:add_late_fee[2% of the amount due, at most once per invoice]
```

Renderers hide `::doc` tags and show the explanation when the reader hovers over or focuses the call or the line. Unlike `::src`, they stay in plain text, where the `::doc:name` lines at the end read like a glossary.

An explanation never carries an effect or a danger. A reviewer may never open it, so whatever the code reads or changes is still tagged on the line where it happens, and a danger is still a `[!…]` note or a `::danger` tag. `::doc:add_late_fee[also emails the customer]` doesn't replace `::write:sendgrid` on the call's line.

## Variables and labels

Tracked variables let a renderer highlight every use of a value, and let a tool follow labeled data to the effects it reaches. Three things create one:

| Source | Example | Tracked name |
| --- | --- | --- |
| Parameter | `get_profile(user_id):` | `user_id`. Write parameters as plain names; a type or default after the name, as in `limit: int = 10`, is ignored. |
| Binding | `row = load_user(user_id)` | `row` |
| Label | `::secret:token` | `token`, even when nothing binds it |

A variable belongs to the whole sketch, not to the block that binds it.

A use is any whole word that matches a tracked name, in code or in prose, so `if cached:` and `for each order:` use `cached` and `order`. An apostrophe ends the name, so `user's team` uses `user`. Matching is case-sensitive. Three positions are not uses:

- After a dot: `user.id` uses `user`, not `id`. A spread or a range isn't a dot, so `...rest` uses `rest`.
- Inside a hyphenated word: `token-rotated` doesn't use `token`.
- Before `::`: `token::Kind` is a path, not a use of `token`.

### Labels

`::untrusted` and `::secret` are labels: their value names a variable instead of a system. A label applies to that variable everywhere in the sketch, wherever the tag sits; by convention it goes on the line where the value enters, as in `body = request.json()  ::untrusted:body`. Tools may let teams declare other label kinds, such as `::pii`.

Labeled data reaches an effect when the labeled variable is used on a line that carries a `::read` or `::write` tag. In the signup example below, `log_event("signup", body)  ::write:logs` sends the untrusted `body` to the logs. Defining a variable is not a use: in `token = refresh(account)  ::write:oauth  ::secret:token`, the write produces the token rather than receiving it.

Labels don't follow bindings. After `user = get_or_create(body.email)`, `user` is not untrusted. Label a derived value too when it should be tracked.

## Changes

A sketch of a commit or pull request describes the code after the change and marks what the change did. Three tags carry the marks:

| Tag | Meaning |
| --- | --- |
| `::new` | The change adds this line. On a block header, it adds the whole block. |
| `::changed[how]` | The change alters what this line does. The note says how, usually by naming the old behavior, as in `::changed[was wall-clock time]`. |
| `::removed[what]` | The change takes this behavior away. On a block header, it removes the whole block. The note is optional when the line already says what is gone. |

A line without a change tag is unchanged; keep only the unchanged lines needed to follow the flow. A line inside a new or removed block takes the change from its header, unless it carries a change tag of its own, as a line moved into a new block does with `::changed[ran before the encoder started]`. A `::changed` header covers only its own line, since a new condition on an `if` doesn't change what runs inside it.

A removed line stays where the behavior used to run, and keeps its effect tags. These are effects the code no longer has, so tools show them as removed rather than counting them among the code's effects or as places labeled data reaches.

By convention, change tags follow a line's effect tags and come before its `::src` tags. In a sketch of a change, `::src` locations refer to the code after the change, so `::repo` names that revision.

```skeudo
cancel_order(order_id):
    order = load_order(order_id)            ::read:postgres.orders[lookup by key]
    if order is shipped:
        ::fail:AlreadyShipped
    refund_id = refund(order.payment)       ::write:stripe ::new
    if that fails:                          ::new
        ::fail:RefundFailed
    mark order cancelled, with refund_id    ::write:postgres.orders ::changed[was deleted]
    email the customer                      ::write:sendgrid ::removed
```

The change refunds the payment before it touches the order. If marking the order fails, the customer has the money back but the order stays open, and a retry refunds again, since nothing makes the refund idempotent. The customer also stops getting an email, which the reviewer should confirm is intended.

## Grammar

The grammar covers only tags, notes, calls, bindings and blocks; any other text is prose. Written in EBNF:

```ebnf
(* Names in tags: letters and digits in any script. *)
name       = ( alnum | "_" ) , { alnum | "-" | "_" } ;
value      = name , { "." , name } | "*" ;
modifier   = "?" | "~" ;
note       = "[" , [ "!" ] , text-without-"]" , "]" ;

tag        = "::" , name , { modifier } , [ ":" , value ] , [ note ] ;

(* Names in code follow code rules: no "-", no leading digit. *)
ident      = ( letter | "_" ) , { alnum | "_" } ;
call       = ident , { ( "." | "::" ) , ident } , "(" , text , ")" ;   (* ")" on the same line *)
binding    = line-start , ident , "=" ;                             (* not "==" or "=>" *)
signature  = first-line , call , ( ":" | block ) ;
block      = line followed by a deeper-indented line ;
```

A value is a system, a variable, a failure name or a call name, depending on the kind. Tag names may contain `-`, as in `legacy-billing`, but code names can't, so `token-rotated` in prose is one word.

Position resolves the edge cases. A tag starts at the beginning of a line or after whitespace. A note belongs to the tag it touches; brackets anywhere else are prose. A block header may end in `:`, but its deeper-indented lines are what make it a block.

## Warnings

A sketch always renders. Problems are warnings attached to their line, never errors, so a half-written sketch can still be read. A parser warns when:

- Indentation isn't 2 or 4 spaces per level, changes unit partway, or doesn't line up with an enclosing block.
- A note has no closing `]`. The `[` and what follows stay prose.
- `::read` or `::write` has no system, `::fail` has no name, a label has no variable, or `::changed` has no note.
- `::src` has no location, or its location has no file and the signature names none.
- `::repo` has no URL, or a sketch has more than one `::repo`. The first one applies.
- `::doc` has no note, has no value on a line with nothing else to explain, or names a call the sketch never makes.

## Authoring rules

These rules apply to anyone writing a sketch, human or AI. The first two carry the contract; the rest keep sketches useful.

| Rule | What it means |
| --- | --- |
| Mark every effect where it happens | Any line that reads or changes outside state carries a tag, whether it is prose or a call. Effects inside a called function are tagged on the call. |
| Keep effects separate and in order | One tag per effect, in execution order. Never fold several effects into untagged words like "undo both". |
| Name the failures the function raises or handles | Each one is `::fail:Name`, inside an `if …:` block for its condition. Failures from callees that simply propagate need no tag. A swallowed failure is noted on its effect, as in `::write:sendgrid[failure ignored]`. |
| Anchor what a reviewer may open | Use real function names for calls worth jumping to. Write everything else as prose. When the source is known, link lines and calls with `::src`, and name the repository and revision with `::repo`. |
| Explain what a name doesn't say | When a call's name doesn't say what it does, explain it with `::doc:name[…]`. When a line's words don't, use `::doc[…]`. Don't explain what the name already says, and never put an effect or a danger only in an explanation. |
| Use prose for intent | Invariants, purposes and summaries go in plain words, such as "only one refresh at a time". |
| Flag doubt instead of guessing | Add `~` or `::unsure[…]` when a claim isn't verified. When a detail like an access pattern is a guess, say "probably" in its note. |
| Flag dangers | Start a note with `!` where a reviewer should stop, as in `::write:stripe[!no idempotency key]` or `::read:postgres.orders[!full scan]`. Use `::danger[…]` for a danger that belongs to the whole line. |
| Label data worth tracking | Add `::untrusted` where outside input enters and `::secret` for sensitive values. |
| Mark what a change did | In a sketch of a commit or pull request, tag added lines `::new`, altered lines `::changed[was …]` and removed behavior `::removed`. See Changes. |
| Leave out observability | Omit logs, metrics and traces, unless they are a requirement like an audit log or labeled data flows into them. A kept log is an effect and gets a tag, such as `::write:logs`. |

## Rendering

A highlighter works only from tags, the shape of calls and bindings, and position, so it needs no vocabulary. Five colors are always on: violet, blue, aqua, orange and red. Amber marks dangers, and pink and purple mark the two labels. Changes use diff colors: green for new, blue for changed and red for removed, shown as a bar in the gutter, where no other color appears.

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
| `::untrusted` tag | Pink pill |
| `::secret` tag | Purple pill |
| `::unsure` tag | Neutral pill with a dotted outline |
| Function name on the signature | Bold blue |
| Call | Blue with a dotted underline; linked to its definition when a `::src` tag gives it |
| First word of a prose line or block header | Violet; see First words |
| Binding or parameter | Bold; colored across all its uses on hover or click |
| Labeled variable | Persistent underline in the label's color: wavy pink for untrusted, solid purple for secret |
| Other kinds | Neutral pill, unless the renderer assigns a color |
| `::src` tag | Hidden; the line links to its source, and calls link to their definitions. A line made only of `::src`, `::repo` and `::doc` tags is hidden entirely. The file named on the signature appears at the end of that line. |
| `::repo` tag | Hidden. Links open a local copy of the repository when the renderer finds one, with a warning when the file has changed since the sketch's revision. Otherwise they go to the file on the repository's host at the sketch's revision, for hosts the renderer knows how to link to. |
| `::doc` tag | Hidden. A line with one gets a small marker after its code. Hovering over or focusing the line shows its explanation, and on a block header the block is highlighted with it. Hovering over or focusing a call shows the explanation its `::doc:name` gives, with the call's source location under it. |
| Trailing tags | Aligned into a right-hand tag column, with their notes. When a line's tags don't fit on one line of the column, a renderer may move them under the line. A note too long for the space wraps rather than being cut off. |
| `::new` tag | Green pill. A green bar in the gutter beside the line, and beside every line of the block it covers |
| `::changed` tag | Blue pill with its note. A blue bar in the gutter beside the line |
| `::removed` tag | Red pill. A red bar in the gutter beside the line and the block it covers, whose code is struck through and whose effects are dimmed |

### First words

The first word of a line is violet, which makes free words like `if`, `return` or `retry` stand out without a keyword list. A word starts with a letter and may contain letters, digits, `_`, `-` and apostrophes, so `re-check` and `don't` are single words.

There is no violet first word when the line is the signature, starts with a binding, a tag or a tracked variable, or when the word is followed by `(`, `.` or `::`, which makes it code. So `return row` and `else:` start violet, while `cache.set(…)`, `row = …` and, once `cached` is bound, `cached is stale` don't.

### Palette

Renderers may change these, but should keep each role distinct.

| Color | Used for | Light | Dark |
| --- | --- | --- | --- |
| Violet | First words | `#6d28d9` | `#a78bfa` |
| Blue | Calls, the signature's name, changed lines | `#1d4ed8` | `#93c5fd` |
| Aqua | Reads | `#0f766e` | `#5eead4` |
| Orange | Writes | `#c2410c` | `#fdba74` |
| Red | Failures, removed lines | `#b91c1c` | `#fca5a5` |
| Green | New lines | `#15803d` | `#86efac` |
| Amber | Dangers | `#a15c07` | `#fcd34d` |
| Pink | Untrusted | `#be185d` | `#f9a8d4` |
| Purple | Secret | `#7c3aed` | `#c4b5fd` |
| Neutral | `::unsure` and other kinds | `#556070` | `#a3acbd` |

## Examples

Each example below surfaces at least one issue a reviewer would catch from the sketch alone.

### Signup: labels and conditional writes

```skeudo
signup(request):
    body = request.json()                 ::untrusted:body
    if body.email is malformed:
        ::fail:InvalidEmail
    user = get_or_create(body.email)      ::write?:postgres.users
    if user is verified:
        ::fail:AlreadyExists
    hash = bcrypt(body.password)          ::secret:hash
    set_password(user, hash)              ::write:postgres.users
    send_verification(user)               ::write:sendgrid
    log_event("signup", body)             ::write:logs
```

The untrusted `body` flows into the log write, so the plain-text password gets logged. The conditional write also raises a question: for an existing unverified user, anyone signing up with that email overwrites the password.

### Order search: access patterns

```skeudo
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

```skeudo
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

```skeudo
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
| Failure names | `! free text`, with no clear end to the name | `::fail:Name`, with the condition as an `if …:` block around it | The name has a clear end, and the condition reads before the outcome, as in code |
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
| Names in code | Calls and bindings used the tag `name` rule, which allows `-` | Code names follow code rules; tag names keep `-` | `token-rotated` in prose is one word, not a use of `token` |
| Label flows | Not specified | Labeled data reaches an effect when the variable is used on the effect's line; labels don't follow bindings | Tools can point at the exact line, and nothing is inferred behind the author's back |
| Label colors | Not specified | Pink for untrusted, purple for secret | The two labels stay distinct from each other and from effects |
| Problems in a sketch | Not specified | Warnings on the line; a sketch always renders | A half-written sketch is still worth reading |
| Changes | Not designed; sketches of commits used provisional `::new`, `::changed` and `::removed` tags | The three tags are defined. New and removed cover their block, and removed effects stay visible but don't count | Commits and pull requests are what gets sketched most, and tags need no grammar change |
| Format name | "Sketch" was a working name, with `` ```sketch `` fences and `.sketch` files | Skeudo, with `` ```skeudo `` fences (`` ```sketch `` still accepted) and `.skeudo` files | `.sketch` belongs to the Sketch design app, and "sketch" alone is a common word other tools also use |
| Source repository | `::src` paths had no stated root, so links resolved against wherever the sketch was opened, and the revision was left to the tool that generated the sketch | `::repo[git+<remote>@<revision>]` names the repository and revision; `::src` paths are relative to its root | A sketch saved or read outside its repository, or read after the code moved on, still links to the right lines. The URL form is the one pip uses for git dependencies |
| Explanations | A free kind such as `::explain[…]` showed its text inline, as a neutral pill | `::doc[…]` explains a line or block, and `::doc:name[…]` a call. Renderers show them on hover | A reviewer can look up a call they don't recognize without the sketch getting longer, and the tag needs no grammar change |

| Open question | Current default |
| --- | --- |
| Whether editors open a file at the sketch's revision, rather than the local copy as it is now | The local copy as it is now, with a warning when the file has changed since the revision |
| Zoom levels: one line, block level, near source | Block level only |
| Whether model calls need their own kind, for cost and nondeterminism | Treated as reads |
| Whether shorthands such as `->sys` come back as sugar for tags | Tags only |
| Whether labels follow bindings, so `user = find(body.email)` makes `user` untrusted | No; the author labels a derived value explicitly |
