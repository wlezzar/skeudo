# Skeudo data view: a data model as tables and a story

Nov 9, 2026 · @Walid Lezzar

This is the data view of Skeudo. [spec.md](spec.md) covers what every view shares: the fence, the first line that names the view, and how warnings work.

## Purpose

A data sketch shows how a system stores its data, in the time it takes to read one screen. It draws a few tables with a few example rows. Then it tells a short story of how those rows appear, change and go away as someone uses the system.

An entity-relationship diagram shows every table and every column, but not what a row looks like or when it is written. A data sketch shows less, on purpose: the tables and columns that carry meaning, the example rows that make them concrete, and one real path through the code. It is meant for a reviewer, a new teammate or an agent's user who asks how the data is stored or how it flows.

## Example

```skeudo
data
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

A data sketch starts with the line `data`. After it, a line that isn't indented starts a group, declares a table or starts a step, and indented lines belong to the group, table or step above them.

| Element | Form | Meaning |
| --- | --- | --- |
| Table | `table name(col, col -> table, …)`, not indented | Declares a table and its columns, in display order. `col -> table` (or `col → table`) makes the column a reference: it holds ids of that table's rows. There is no space before the parenthesis, so a step titled `Login (Google)` is still a step. A declaration may run over several lines, up to its closing parenthesis. |
| Folder | `folder name(col, …)`, not indented | Declares a store of files, such as a bucket or a folder on disk. It works like a table: a row is a file, its id is the file's path, and its columns are what the sketch shows about each file. See Folders. |
| Group | `[label]`, alone on a line, not indented | Starts a group: the tables and folders declared after it, up to the next group line, are drawn in one frame. See Groups. |
| Step | Any other line that isn't indented | Starts a step of the story. The line is its title, in free words. A step may have no changes. |
| Add | `+ table id  col: value \| col: value`, indented under a step | Adds a row. Columns it leaves out are empty. |
| Change | `~ table id  col: value \| …`, indented under a step | Changes the columns it lists and keeps the others. |
| Delete | `- table id`, indented under a step | Deletes the row. |
| Explanation | Any other indented line | Explains the group, table or step above it. Consecutive lines join into one paragraph, and a blank line starts a new one. Explanations may sit before, between or after a step's changes. |

More precisely:

- **Kinds.** Every declaration starts with its kind, `table` or `folder`. A folder is a table in every rule below. Only its drawing differs.
- **Names.** Table and column names use letters, digits, `_`, `.` and `-`.
- **Ids.** A row id is any word without spaces. It must be unique among a table's rows. A deleted id may be added again.
- **Values.** Values are separated by `|`, and each is split at its first `:`, so `expires: 10:14` works. A value is the text after the colon, trimmed. The word `null` is an empty value.
- **Quotes.** A value in double quotes is taken as written. Quotes keep a `|`, spaces at the edges, or the word null as text.
- **No types.** `false` and `42` are text like any other value.
- **Order.** Tables may be declared anywhere, and are drawn in the order they are declared, so the author picks the layout. Steps play in the order they are written.

### Folders

A folder holds files keyed by path: an S3 bucket, a folder on disk. Its rows are files, so `+` uploads one, `~` overwrites it or changes its metadata, and `-` deletes it.

```skeudo
data
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
data
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
| A group line has no label. It is still drawn, with no label | `A group needs a label, as in [Checkout].` |
| A group has no tables | `The group Retry has no tables.` |
| Two groups have the same label. Both are drawn | `There is already a group named Checkout.` |
| A change has no table or no id | `A change needs a table and a row id, as in + media m1.` |
| A deletion lists values | `A deletion takes no values.` |
| A value has no colon | `"nope" should be column: value.` |
| A change names a table that isn't declared | `No table named medai.` |
| A change names a column the table doesn't have | `exercise has no column practised.` |
| A row is added with an id that is already in use | `media m1 already exists.` |
| A row is changed or deleted when it doesn't exist | `media m9 doesn't exist at this step.` |
| A reference points at a row that doesn't exist at that step. It is reported once, at the line that set the value | `attempt a1.recording points at media m7, which doesn't exist at step 6.` |
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
| Group only when it helps | Add groups when the tables fall into two or more parts a reader looks at separately. A sketch of three or four tables needs none. |
| Give groups one meaning | Pick the reason before writing: a feature, a store, a role or a lifecycle. Keep to one reason in a sketch, so the frames mean one thing. Use two to four groups, with labels of a word or two. |

## Rendering

- **Everything fits on one screen and stays put.** Tables, columns and rows don't move between steps. Each table keeps room for the most rows it ever shows, and each column keeps its widest width across all steps, up to a cap. A longer value is cut off, with the whole value on hover.
- **Only the current step's changes stand out.** A new row is green, a changed cell blue, and a deleted row red and struck through. A changed cell shows its old value on hover. These are the colors every view uses for changes.
- **No prose on the page except step titles.** A group, table or step with an explanation gets a small "i" mark. Hovering over the group's label, the table's name or the step shows the explanation in a popover, and clicking the mark keeps it open until Escape or a click elsewhere.
- **References are chips, not lines.** Hovering over a reference highlights the row it points at, and hovering over a row highlights the references to it. This works across groups too.
- **A folder is a card with a tab.** The tab holds its name with a trailing slash, as in `uploads/`. Each file is a line: its path, then its columns, with the column names on top as for a table. Where a path starts with the same folders as the one above it, those folders are dimmed. Files keep the order they were added in, as rows do. A reference to a file shows the file's name, with the whole path on hover.
- **A group is a light frame** with its label on top. Its tables wrap inside it, and it wraps to the next line as a whole. Tables in no group come first, then the groups, in the order they are declared. A label longer than the cap for values is cut off, with the whole label on hover. A sketch without groups has no frames.
- **The story is a list beside the tables.** Clicking a step selects it, and the arrow keys step through the story while the sketch has focus. In a narrow space, the list goes above the tables.
- **Without a script, the last step shows**, since it has the whole model filled in. With one, the sketch starts at the first step.
- **Empty values** show as a faint dash. A table with no rows yet shows "empty".
- **Warnings** are listed under the sketch, with their line numbers.

## Decisions and open questions

| Decision | Why |
| --- | --- |
| The view is named on the block's first line, in the same `skeudo` fence | The view travels with the text when it is copied out of its fence, piped to the CLI or saved as a `.skeudo` file. A new view adds no fence or language. See spec.md |
| A deleted row stays visible, struck through, for the step that deletes it | The reader sees what went away. It is gone from the next step on |
| Explanations are never shown inline | The first prototype showed them on the page, and readers lost track of the tables |
| Values have no types | The view shows examples, not a schema |
| Every declaration starts with its kind, `table` included | Every declaration reads the same way, and a new kind is one more word |
| A folder is a table drawn differently | Files are added, overwritten and deleted like rows, so the format needs no new change syntax |
| A file's content is shown as the fields that matter, not as a whole document | A document runs over many lines, and drawn on the board it would break "one screen, nothing moves" |
| A group's label is free words, not a store type | A frame can mean a feature, a store, a role or a lifecycle. A store's shape is the table's kind |
| One level of groups, one group per table | A frame inside a frame doesn't fit the board. A hierarchy goes in the label |
| No icons on folders or groups | The tab, the slash and the label do the job. Generic icons could come later without changing the syntax |

| Open question | Current default |
| --- | --- |
| Branching stories, such as a failure path next to the happy path | Not supported. Write a second sketch |
| Explanations on columns | Not supported. Explain a column in its table's explanation |
| Showing a column under a different name than the real one | Not supported. Authors pick the names they want shown |
| A file's whole content, such as a JSON document | Not supported. Show the fields that matter as columns. It could go in a popover later |
| More kinds, such as a queue or a stream | Not supported. Add one only when its look or its operations differ from a table's |
