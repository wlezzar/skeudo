# Skeudo data view: a data model as tables and a story

Nov 9, 2026 · @Walid Lezzar

> **Alpha.** This view will change in ways that break existing sketches. Until 1.0, breaking changes come in minor versions (0.1 to 0.2), never in patches, and the [release notes](https://github.com/wlezzar/skeudo/releases) list each one.

This is the data view of Skeudo. [spec.md](spec.md) covers what every view shares: the fence, the first line that names the view, and how warnings work.

## Purpose

A data sketch shows how a system stores its data, in the time it takes to read one screen. It draws a few tables with a few example rows. Then it tells a short story of how those rows appear, change and go away as someone uses the system.

An entity-relationship diagram shows every table and every column, but not what a row looks like or when it is written. A data sketch shows less, on purpose: the tables and columns that carry meaning, the example rows that make them concrete, and one real path through the code. It is meant for a reviewer, a new teammate or an agent's user who asks how the data is stored or how it flows.

## Example

```skeudo
view: data
table customer(name, email)
  One account. A guest gets a row too, with no email.

table order(customer -> customer, state, total, payment -> payment)
  What the customer buys. The order lines aren't shown.

table payment(provider, state, amount)
  One attempt to charge a card. A declined payment is kept,
  and a retry adds a new row.

table shipment(order -> order, carrier, tracking)

Ana checks out as a guest
  + customer c1  name: Ana | email: null
  + order o1     customer: c1 | state: pending | total: 42.00

Her card is declined
  + payment p1   provider: stripe | state: declined | amount: 42.00
  ~ order o1     payment: p1

She pays with another card
  The declined payment stays for the records, and the order
  points at the new one.
  + payment p2   provider: stripe | state: captured | amount: 42.00
  ~ order o1     state: paid | payment: p2

She creates an account
  The guest row is upgraded in place, so her past orders stay hers.
  ~ customer c1  email: ana@example.com

The order ships
  + shipment h1  order: o1 | carrier: UPS | tracking: 1Z999AA1
  ~ order o1     state: shipped

The declined payment is purged after 30 days
  - payment p1
```

Rendered, the four tables sit side by side and the six steps are listed beside them. Selecting a step shows the rows as they are after it, with that step's changes in color.

## Format

A data sketch starts with the header `view: data`. After it, a line that isn't indented starts a group, declares a table or starts a step, and indented lines belong to the group, table or step above them.

| Element | Form | Meaning |
| --- | --- | --- |
| Table | `table name(col, col -> table, …)`, not indented | Declares a table and its columns, in display order. `col -> table` (or `col → table`) makes the column a reference: it holds ids of that table's rows. There is no space before the parenthesis, so a step titled `Login (Google)` is still a step. A declaration may run over several lines, up to its closing parenthesis. |
| Folder | `folder name(col, …)`, not indented | Declares a store of files, such as a bucket or a folder on disk. It works like a table: a row is a file, its id is the file's path, and its columns are what the sketch shows about each file. See Folders. |
| Group | `[label]`, alone on a line, not indented | Starts a group: the tables and folders declared after it, up to the next group line, are drawn in one frame. See Groups. |
| Step | Any other line that isn't indented | Starts a step of the story. The line is its title, in free words. A step may have no changes. |
| Substep | `> title`, indented under a step | Starts a pause inside the step. Its changes and reads show together. See Substeps. |
| Add | `+ table id  col: value \| col: value`, indented under a step or substep | Adds a row. Columns it leaves out are empty. |
| Change | `~ table id  col: value \| …`, indented under a step or substep | Changes the columns it lists and keeps the others. |
| Delete | `- table id`, indented under a step or substep | Deletes the row. |
| Read | `? table id`, `? table col: value \| …` or `? folder prefix/`, indented under a step or substep | Finds rows and changes nothing. See Reads. |
| Explanation | Any other indented line | Explains the group, table, step or substep above it. Consecutive lines join into one paragraph, and a blank line starts a new one. Explanations may sit before, between or after a step's changes. |

More precisely:

- **Kinds.** Every declaration starts with its kind, `table` or `folder`. A folder is a table in every rule below. Only its drawing differs.
- **Names.** Table and column names use letters, digits, `_`, `.` and `-`.
- **Ids.** A row id is any word without spaces. It must be unique among a table's rows. A deleted id may be added again.
- **Values.** Values are separated by `|`, and each is split at its first `:`, so `expires: 10:14` works. A value is the text after the colon, trimmed. The word `null` is an empty value.
- **Quotes.** A value in double quotes is taken as written. Quotes keep a `|`, spaces at the edges, or the word null as text.
- **No types.** `false` and `42` are text like any other value.
- **Order.** Tables may be declared anywhere, and are drawn in the order they are declared, so the author picks the layout. Steps, substeps, changes and reads play in the order they are written.

### Folders

A folder holds files keyed by path: an S3 bucket, a folder on disk. Its rows are files, so `+` uploads one, `~` overwrites it or changes its metadata, and `-` deletes it.

```skeudo
view: data
table media(owner, state, file -> uploads)

folder uploads(type, size)
  The bucket the browser uploads to. Keys are owner/media/name.

Ana uploads a video
  + uploads ana/m1/raw.mp4   type: video/mp4 | size: 120 MB
  + media m1                 owner: ana | state: uploaded | file: ana/m1/raw.mp4

The transcoder writes a smaller copy
  + uploads ana/m1/720p.mp4  type: video/mp4 | size: 18 MB
  ~ media m1                 state: ready | file: ana/m1/720p.mp4

The raw file is deleted after a week
  - uploads ana/m1/raw.mp4
```

- **Paths are ids.** A path is a word without spaces, so it follows the rules for ids. A reference to a folder holds paths.
- **Columns are what matters about a file.** Metadata such as `type` and `size`, or fields of its content. A nested field of a JSON file is a dotted name, as in `folder exports(order -> order, customer.email, total)`, and a field that holds an id may be a reference. A file's whole content isn't shown.
- **No columns.** A folder may have none, as in `folder tmp()`. The parentheses stay.

### Groups

A group is a labeled frame around some tables, for a sketch whose tables fall into parts a reader looks at separately. The label is free words, and the parser doesn't interpret it. A group may stand for a feature, a store, a role in the data, a lifecycle or an owner. The author decides.

```skeudo
view: data
[Checkout]
  What a purchase writes, in one transaction.
table customer(name, email)
table order(customer -> customer, state, total, payment -> payment)
table payment(provider, state, amount)

[Accounting]
  Read by the accounting tool each night.
folder exports(order -> order, customer.email, total)
  One JSON file per paid order. Only the fields the tool reads are shown.

[Shipping]
table shipment(order -> order, carrier, label -> labels)
folder labels(size)
  The PDFs the carrier returns, in the S3 bucket shipping-docs.
  Keys are carrier/shipment/name.

Ana checks out
  + customer c1  name: Ana | email: ana@example.com
  + order o1     customer: c1 | state: pending | total: 42.00

Her payment is captured
  + payment p1   provider: stripe | state: captured | amount: 42.00
  ~ order o1     state: paid | payment: p1

The order is exported for accounting
  A job writes the file a few seconds after the payment.
  + exports 2026-11/o1.json  order: o1 | customer.email: ana@example.com | total: 42.00

A shipping label is bought
  + labels ups/h1/label.pdf    size: 84 KB
  + labels ups/h1/customs.pdf  size: 112 KB
  + shipment h1  order: o1 | carrier: UPS | label: ups/h1/label.pdf

UPS sends a corrected label
  The file is overwritten under the same key, so the shipment still points at it.
  ~ labels ups/h1/label.pdf  size: 86 KB

The order ships
  ~ order o1  state: shipped

The customs form is deleted after delivery
  - labels ups/h1/customs.pdf
```

- **A group runs to the next group line.** Steps don't end it, and may sit anywhere among the declarations. A table declared before the first group line is in no group.
- **One group per table, one level.** Groups don't nest. A hierarchy goes in the label, as in `[Billing / Postgres]`.
- **Indented lines under a group line explain it**, like a table's. Changes don't go under a group.
- **The label is shown as written.** In plain text, `[Checkout]` reads as a section heading, as in an INI file.
- **A store's kind belongs to the table, not to the group.** A group may hold tables and folders together, as Shipping does above.

### Substeps

A step can pause more than once. Under a step, a line starting with `>` starts a substep. Its title is free words, like a step's. The lines indented under it are its changes, its reads and its explanation, and they show together, as one board.

```skeudo
view: data
table media(owner, state, file -> uploads)
  One video or photo.

folder uploads(type, size)
  The bucket the browser uploads to. Keys are owner/media/name, so one
  listing finds a person's files, or a video's.

Ana uploads a video
  + uploads ana/m1/raw.mp4   type: video/mp4 | size: 120 MB
  + media m1                 owner: ana | state: uploaded | file: ana/m1/raw.mp4

Ben uploads a photo
  + uploads ben/m2/raw.jpg   type: image/jpeg | size: 3 MB
  + media m2                 owner: ben | state: uploaded | file: ben/m2/raw.jpg

The transcoder makes a smaller copy
  > It writes the 720p file
    + uploads ana/m1/720p.mp4  type: video/mp4 | size: 18 MB
  > It points the video at the copy
    The file is written first, so the row never points at a missing file.
    ~ media m1                 state: ready | file: ana/m1/720p.mp4

Ana opens her library
  ? media  owner: ana

She downloads everything she uploaded
  One listing by prefix finds all her files, the raw upload included,
  since keys start with the owner.
  ? uploads ana/
```

- **The author decides where the story pauses.** A substep may hold a read then a write, two reads in order, or two writes whose order matters, such as the file written before the row that points at it above.
- **Each substep shows only its own changes.** They are colored against the board before: the substep before, or the step before for a step's first substep.
- **The text before a step's first substep explains the step**, and the text under a substep explains the substep. How deep a line is indented doesn't matter, as for every indented line.
- **Once a step has substeps, its changes and reads go under them.** One written above the first substep plays with the first substep, with a warning.
- **Substeps don't nest.** A `>` line under a substep starts the next substep of the same step.
- **Warnings name a substep by its step and its place**, as in step 3.2.
- **In plain text**, a step with substeps reads as a nested list: the step, its substeps, their changes.

### Reads

A read is a line under a step or substep, in the same shape as a change. It finds rows and changes nothing.

| Form | Finds |
| --- | --- |
| `? table id` | That row. |
| `? table col: value \| …` | The rows where every listed column equals its value. |
| `? folder prefix/` | The files whose path starts with the prefix. A prefix ends with `/`. |

```skeudo
view: data
table customer(name, email)
  One account per email.

table order(customer -> customer, state, total, payment -> payment)
  What the customer buys. payment points at the attempt that counts.

table payment(provider, state, amount)
  One attempt to charge a card. A declined payment is kept for 30 days.

table shipment(order -> order, carrier, tracking)

Ana checks out
  > Checkout looks her email up
    The email is the only way to tell a returning customer from a new one.
    ? customer     email: ana@example.com
  > No one has it, so she gets an account
    The account and the order are written in one transaction.
    + customer c1  name: Ana | email: ana@example.com
    + order o1     customer: c1 | state: pending | total: 42.00

Her card is declined
  + payment p1   provider: stripe | state: declined | amount: 42.00
  ~ order o1     payment: p1

She pays with another card
  + payment p2   provider: stripe | state: captured | amount: 42.00
  ~ order o1     state: paid | payment: p2

She checks out again
  > Checkout finds her by email
    ? customer     email: ana@example.com
  > Stripe charges her card
    The payment is saved before the order, so a crash leaves a payment
    with no order rather than an order nobody paid for.
    + payment p3   provider: stripe | state: captured | amount: 18.00
  > The order goes to her account
    + order o2     customer: c1 | state: paid | total: 18.00 | payment: p3

She opens her orders
  > The page lists her orders
    ? order        customer: c1
  > It shows each order's payment
    It follows the order's pointer, so the declined attempt is never read.
    ? payment p2
    ? payment p3

The first order ships
  + shipment h1  order: o1 | carrier: UPS | tracking: 1Z999AA1
  ~ order o1     state: shipped

She tracks the parcel
  order has no shipment column, so the page looks the shipment up by
  its order.
  ? shipment     order: o1

Declined payments are purged after 30 days
  A nightly job, outside any request.
  > It finds the declined payments
    The age check isn't shown.
    ? payment      state: declined
  > It deletes them
    - payment p1
```

- **A read shows why a column or a key exists.** `order.payment` is there so the order page finds the attempt that counts, which step 5 shows. A step that only reads, such as "She tracks the parcel", shows nothing without its reads.
- **A read finds rows as they are at its line**: after the substep or step before, and after the changes above it in its own substep or step. So a read written before a deletion finds the row.
- **A lookup may find nothing**, since a miss is often the point, as in step 1. A read by id must find its row.
- **Only equality.** Ranges, sorting, limits and joins go in the title, and the read names the rows by id, as step 5 does for the payments.
- **Values** follow the rules for a change's: `null` matches an empty value, and quotes keep text as written.
- **What a read costs**, such as a scan of a whole table or one query per row, belongs in the code view.

## Warnings

A data sketch always renders. A parser warns when:

| Problem | Message |
| --- | --- |
| A column in a declaration isn't a name or a reference | `"bad col" isn't a column: write a name, or name -> table.` |
| A column is declared twice in a table | `media has two columns named role.` |
| A declaration doesn't start with its kind. It is read as a table | `The declaration of media should start with table or folder, as in table media(…).` |
| A declaration has no closing parenthesis | `The declaration of media should end with ), as in table media(role, type).` |
| A table is declared twice. The first declaration applies | `media is declared twice.` |
| A reference names a table that isn't declared | `media.owner points at user, which isn't declared.` |
| An indented line comes before any table or step | `This line is indented but has no table or step above it.` |
| A change is indented under a table | `Changes go under a step, not under a table.` |
| A change is indented under a group line | `Changes go under a step, not under a group.` |
| A substep or read is indented under a table or a group line | `Substeps go under a step, not under a table.` or `Reads go under a step, not under a group.` |
| A substep has no title. It is still drawn | `A substep needs a title, as in > Checkout looks her email up.` |
| A change or read comes before the first substep of a step that has substeps. It plays with the first substep | `Changes go under a substep once a step has substeps.` or `Reads go under a substep once a step has substeps.` |
| A group line has no label. It is still drawn, with no label | `A group needs a label, as in [Checkout].` |
| A group has no tables | `The group Retry has no tables.` |
| Two groups have the same label. Both are drawn | `There is already a group named Checkout.` |
| A change has no table or no id | `A change needs a table and a row id, as in + media m1.` |
| A deletion lists values | `A deletion takes no values.` |
| A read has no table, nothing to find, or more than one word that isn't `col: value` | `A read needs a row id, a path prefix or col: value, as in ? media m1.` |
| A value has no colon | `"nope" should be column: value.` |
| A change or read names a table that isn't declared | `No table named medai.` |
| A change or read names a column the table doesn't have. A lookup on it finds nothing | `exercise has no column practised.` |
| A read lists paths in a table that isn't a folder | `media isn't a folder, so it has no paths to list.` |
| A row is added with an id that is already in use | `media m1 already exists.` |
| A row is changed, deleted or read by id when it doesn't exist | `media m9 doesn't exist at this step.` |
| A reference points at a row that doesn't exist at that step or substep. It is reported once, at the line that set the value | `attempt a1.recording points at media m7, which doesn't exist at step 6.`, or `at step 4.2` in a substep |
| No table is declared | `No tables are declared.` |

## Authoring rules

| Rule | What it means |
| --- | --- |
| Show less | Pick the 3 to 6 tables the question is about, and in each the 2 to 5 columns that carry meaning. Leave out ids, owners and timestamps unless they are the point. Say what is left out in the text around the sketch. |
| Tell one real path | Follow one path through the code, in 5 to 10 steps. Leave failure paths for another sketch. |
| Keep titles to one line | A title says what happened, in the reader's words: "Ana uploads a video", not "POST /uploads". |
| Explain only what isn't obvious | A transaction boundary, a row rewritten in place, or why a column is missing. Leave out what the rows already show. |
| Check the rows against the code | Every change should be one the code really makes, in that order. Values are examples, but their shape should be real. |
| Use short ids | `m1`, `s1`, `o1`: a letter for the table and a number, so references are easy to follow. A file's id is its real path, since the layout of the keys is often the point. |
| Use a folder for files | When the data is files keyed by path. Show 1 to 3 files, and as columns the metadata or content fields the question is about. |
| Show the reads that explain | Show a read only when it explains a column, a reference or a key, or when the step only reads. Don't show the reads before every write. |
| Read in its own substep | When a step reads and then writes, put the read in its own substep, so the reader sees it before the changes. |
| Use few substeps | Use substeps when the order inside a step is the point. Keep to two or three, with titles of a few words. |
| Group only when it helps | Add groups when the tables fall into two or more parts a reader looks at separately. A sketch of three or four tables needs none. |
| Give groups one meaning | Pick the reason before writing: a feature, a store, a role or a lifecycle. Keep to one reason in a sketch, so the frames mean one thing. Use two to four groups, with labels of a word or two. |

## Rendering

- **Everything fits on one screen and stays put.** Tables, columns and rows don't move between steps. Each table keeps room for the most rows it ever shows, and each column keeps its widest width across all steps, up to a cap. A longer value is cut off, with the whole value on hover.
- **Only the current step's changes stand out.** A new row is green, a changed cell blue, and a deleted row red and struck through. A changed cell shows its old value on hover. These are the colors every view uses for changes.
- **No prose on the page except step titles.** A group, table or step with an explanation gets a small "i" mark. Hovering over the group's label, the table's name or the step shows the explanation in a popover, and clicking the mark keeps it open until Escape or a click elsewhere.
- **References are chips, not lines.** Hovering over a reference highlights the row it points at, and hovering over a row highlights the references to it. This works across groups too.
- **A row a read finds has an aqua ring.** Aqua is the code view's color for reads. What the read matched on is aqua too: the row's id, the prefix of its path, or the cells of the lookup's columns, whose names are underlined. A read that finds nothing puts a dashed "no match" badge beside its table's name. A sketch with reads has a fourth entry in the legend, "read".
- **A line goes from the story to each row a read finds**: an aqua curve with an arrowhead, from the right edge of the current step, level with the step or substep, to the row's left edge. For a read that finds nothing, it points at the table's column names. The lines need the script, and are left out where the list goes above the tables, since they would cross it. The rings, the aqua cells and the badges show without them.
- **A folder is a card with a tab.** The tab holds its name with a trailing slash, as in `uploads/`. Each file is a line: its path, then its columns, with the column names on top as for a table. Where a path starts with the same folders as the one above it, those folders are dimmed. Files keep the order they were added in, as rows do. A reference to a file shows the file's name, with the whole path on hover.
- **A group is a light frame** with its label on top. Its tables wrap inside it, and it wraps to the next line as a whole. Tables in no group come first, then the groups, in the order they are declared. A label longer than the cap for values is cut off, with the whole label on hover. A sketch without groups has no frames.
- **The story is a list beside the tables.** Clicking a step selects it, and the arrow keys step through the story while the sketch has focus. In a narrow space, the list goes above the tables.
- **Substeps are always listed under their step**, smaller, on a thin line, so the list never changes height. The arrow keys walk through every substep, and clicking a step shows its first one. The step stays selected while one of its substeps shows. A substep with an explanation has its own "i" mark.
- **Without a script, the last step shows**, or the last substep of the last step, since it has the whole model filled in. With one, the sketch starts at the first step.
- **Empty values** show as a faint dash. A table with no rows yet shows "empty".
- **Warnings** are listed under the sketch, with their line numbers.

## Decisions and open questions

| Decision | Why |
| --- | --- |
| The view is named on the block's first line, as `view: data`, in the same `skeudo` fence | The view travels with the text when it is copied out of its fence, piped to the CLI or saved as a `.skeudo` file. A new view adds no fence or language. See spec.md |
| A deleted row stays visible, struck through, for the step that deletes it | The reader sees what went away. It is gone from the next step on |
| Explanations are never shown inline | The first prototype showed them on the page, and readers lost track of the tables |
| Values have no types | The view shows examples, not a schema |
| Every declaration starts with its kind, `table` included | Every declaration reads the same way, and a new kind is one more word |
| A folder is a table drawn differently | Files are added, overwritten and deleted like rows, so the format needs no new change syntax |
| A file's content is shown as the fields that matter, not as a whole document | A document runs over many lines, and drawn on the board it would break "one screen, nothing moves" |
| A group's label is free words, not a store type | A frame can mean a feature, a store, a role or a lifecycle. A store's shape is the table's kind |
| One level of groups, one group per table | A frame inside a frame doesn't fit the board. A hierarchy goes in the label |
| No icons on folders or groups | The tab, the slash and the label do the job. Generic icons could come later without changing the syntax |
| Substeps are written with `>`, not cut at each read and write | The author decides where the story pauses. Two writes in order, such as a file before the row that points at it, are a pause that cutting at reads and writes can't show. Numbers such as 4.1 would need renumbering, and the parser would ignore them |
| A step's reads show apart from its writes, in their own substep | The first mock showed a step's reads and writes on one board, and readers found it confusing: a "no match" sat next to the row the step then added |
| Substeps are always listed | The list keeps its height, so in a narrow space, where the list is above the tables, the tables don't move as the reader steps |
| A row a read finds gets a ring, not a fill | A fill reads as a change: an aqua fill looks like a new green row |
| Reads match by equality only | Example rows can show which rows a value finds. Ranges, sorting and joins would need a query language, and the title says them in fewer words |
| A read finds rows at its line, not at the end of its substep | So a read before a deletion finds the row it deletes, as the code does |
| A read is drawn as a line from the story; references stay chips | A read comes from outside the tables, from the code that runs at that step, so a line from the step says who reads. A mark beside each row widened every table it touched, and a person icon was wrong for a nightly job. References are between rows, and a line for each would cover the tables |

| Open question | Current default |
| --- | --- |
| Branching stories, such as a failure path next to the happy path | Not supported. Write a second sketch |
| Explanations on columns | Not supported. Explain a column in its table's explanation |
| Showing a column under a different name than the real one | Not supported. Authors pick the names they want shown |
| A file's whole content, such as a JSON document | Not supported. Show the fields that matter as columns. It could go in a popover later |
| More kinds, such as a queue or a stream | Not supported. Add one only when its look or its operations differ from a table's |
| Naming the columns a read uses, as in `? order o1 → state, total` | Not supported. It would show which code uses a column |
| A read of every row, as `? table` alone | Not supported. Name the rows by id, or by a column they share |
| A mark in the list for a step that only reads | None |
