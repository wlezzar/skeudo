# Data sketches

A data sketch shows how a system stores its data: a few tables (and folders of files) with example rows, and a short story of how those rows appear, change and go away as someone uses the system. Rendered, the tables sit beside the list of steps, and selecting a step shows the rows after it, with that step's changes in color. Explanations show only on hover.

Write one when someone asks how data is stored, what a table holds, how records point at each other, or what happens to the data during a flow such as an upload, a checkout or a sync. For what code does, write a code sketch (SKILL.md). The two work well together: a data sketch of the model, and code sketches of the flows that write it.

## Syntax

A data sketch is a `skeudo` fence whose first line is `view: data`.

| Element | Form | Notes |
| --- | --- | --- |
| Table | `table name(col, col -> table)`, not indented | Columns in display order. `col -> table` holds ids of that table's rows. No space before `(`. May run over several lines up to `)`. |
| Folder | `folder name(col)`, not indented | Files keyed by path, such as an S3 bucket. Works like a table: the row id is the path, the columns are metadata or content fields. |
| Group | `[label]`, alone on a line | Frames the tables and folders declared after it, up to the next group line. |
| Step | Any other line that isn't indented | Its title, in free words. |
| Substep | `> title`, indented under a step | A pause inside the step, with its own changes, reads and explanation. |
| Add a row | `+ table id  col: value \| col: value`, indented under a step or substep | Columns left out are empty. |
| Change a row | `~ table id  col: value`, indented under a step or substep | Only the listed columns change. |
| Delete a row | `- table id`, indented under a step or substep | No values. |
| Read rows | `? table id`, `? table col: value \| …` or `? folder prefix/`, indented under a step or substep | Finds rows and changes nothing. A lookup matches by equality and may find nothing. |
| Explanation | Any other indented line | Explains the group, table, step or substep above it. A blank line starts a new paragraph. |

- **Ids** are words without spaces, unique among a table's rows: `m1`, `s1`. A deleted id may be added again.
- **Values** are split from their column at the first `:`, so `at: 10:14` works. `null` is empty. Double quotes keep a `|` or edge spaces: `note: "a | b"`. Values have no types.
- **Order.** Tables are drawn in the order they are declared, so declare the main ones first. Steps, substeps, changes and reads play in the order they are written, so a read finds the rows as they are at its line.

### Folders

Use a folder when the data is files keyed by path: uploads, exports, generated documents. `+` uploads a file, `~` overwrites it or changes its metadata, `-` deletes it. Use the real key layout as the path, since it is often the point: `+ uploads ana/m1/raw.mp4  type: video/mp4 | size: 120 MB`. A reference to a folder holds a path: `table media(file -> uploads)`.

When a file's content matters, such as a JSON export, its columns are the fields that matter. Nested fields are dotted names, and a field holding an id can be a reference: `folder exports(order -> order, customer.email, total)`. Don't try to show the whole document.

### Groups

Add groups only when the tables fall into two or more parts a reader looks at separately. A sketch of three or four tables needs none. Pick one reason for the groups before writing (a feature, a store, a role in the data, or a lifecycle), keep to it, and use two to four groups with labels of a word or two:

```skeudo
view: data
[Postgres]
table order(state, total)

[Elasticsearch]
  Rebuilt from orders by a job a few seconds after each write.
table order_doc(state, total)

Ana pays
  + order o1  state: paid | total: 42.00

The index catches up
  + order_doc o1  state: paid | total: 42.00
```

A group runs to the next group line, and steps don't end it. Groups don't nest: write a hierarchy in the label, as in `[Billing / Postgres]`. Don't start a step title with `[`.

### Substeps and reads

Most columns and keys exist for a read: `order.payment` so the order page finds the attempt that counts, a path that starts with the owner so one listing finds a person's files. A read shows that reason, and a step that only reads, such as "She opens her orders", needs its reads to show anything.

- **Show a read only when it explains** a column, a reference or a key, or when the step only reads. Don't show the reads before every write.
- **When a step reads and then writes, put the read in its own substep**, so the reader sees it before the changes.
- **Use substeps when the order inside a step is the point**: a lookup before an insert, or a file written before the row that points at it. Keep to two or three, with titles of a few words. Once a step has substeps, put all its changes and reads under them; the text above the first one explains the step.
- **Only equality.** Write ranges, sorting and joins in the title, and name the rows the read finds by id.

```skeudo
view: data
table customer(name, email)
  One account per email.

table order(customer -> customer, state, total)

Ana checks out
  > Checkout looks her email up
    ? customer     email: ana@example.com
  > No one has it, so she gets an account
    The account and the order are written in one transaction.
    + customer c1  name: Ana | email: ana@example.com
    + order o1     customer: c1 | state: paid | total: 42.00

She opens her orders
  ? order  customer: c1
```

## Workflow

1. **Find the model** at the revision you're sketching: migrations, schema files, ORM models, and the code that writes files to storage. Note which columns hold ids of other tables or paths of files.
2. **Pick what to show.** 3 to 6 tables, the ones the question is about, and in each the 2 to 5 columns that carry meaning. The row id is always shown, so leave out the id column. Leave out owner and timestamp columns unless they are the point. Say what you left out in one sentence after the sketch.
3. **Pick one real path** through the code, the one the user asked about or the main one, and follow it: each insert, update and delete, in the order the code makes them. Leave failure paths for another sketch.
4. **Write 5 to 10 steps.** A title says what happened, in the reader's words: "Ana uploads a video", not "POST /uploads". Writes made in one transaction or one request usually make one step. A step may have no changes when it explains a moment worth seeing, but keep that rare. Add the reads that explain a column or a key, and substeps where the order inside a step matters.
5. **Explain only what the rows don't show:** a transaction boundary, a row rewritten in place rather than replaced, a write that happens later in a background job, why a column you might expect is missing. Keep each explanation to a sentence or two. Never put a change only in an explanation.
6. **Use realistic values.** Short ids, a letter for the table and a number. States from the code's enums, real MIME types, plausible names and amounts.
7. **Check.** If the `skeudo` command is installed, run `skeudo check doc.md` and fix every warning: unknown tables or columns, ids used twice, rows changed or read before they exist, references to rows that don't exist at that step. Then read each step against the code once more.

## Output

As for code sketches, a Markdown document: a sentence or two on what the model is for, the sketch, then "Not shown: …" and anything a reviewer should look at, such as a row that can point at a deleted one, or a state the code never leaves.

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

Not shown: order lines, addresses, and the timestamp and owner columns.
