# Data sketches

A data sketch shows how a system stores its data: a few tables with example rows, and a short story of how those rows appear, change and go away as someone uses the system. Rendered, the tables sit beside the list of steps, and selecting a step shows the rows after it, with that step's changes in color. Explanations show only on hover.

Write one when someone asks how data is stored, what a table holds, how records point at each other, or what happens to the data during a flow such as an upload, a checkout or a sync. For what code does, write a code sketch (SKILL.md). The two work well together: a data sketch of the model, and code sketches of the flows that write it.

## Syntax

A data sketch is a `skeudo` fence whose first line is `data`.

| Element | Form | Notes |
| --- | --- | --- |
| Table | `name(col, col -> table)`, not indented | Columns in display order. `col -> table` holds ids of that table's rows. No space before `(`. May run over several lines up to `)`. |
| Step | Any other line that isn't indented | Its title, in free words. |
| Add a row | `+ table id  col: value \| col: value`, indented under a step | Columns left out are empty. |
| Change a row | `~ table id  col: value`, indented under a step | Only the listed columns change. |
| Delete a row | `- table id`, indented under a step | No values. |
| Explanation | Any other indented line | Explains the table or step above it. A blank line starts a new paragraph. |

- **Ids** are words without spaces, unique among a table's rows: `m1`, `s1`. A deleted id may be added again.
- **Values** are split from their column at the first `:`, so `at: 10:14` works. `null` is empty. Double quotes keep a `|` or edge spaces: `note: "a | b"`. Values have no types.
- **Order.** Tables are drawn in the order they are declared, so declare the main ones first. Steps play in order.

## Workflow

1. **Find the model** at the revision you're sketching: migrations, schema files, ORM models. Note which columns hold ids of other tables.
2. **Pick what to show.** 3 to 6 tables, the ones the question is about, and in each the 2 to 5 columns that carry meaning. The row id is always shown, so leave out the id column. Leave out owner and timestamp columns unless they are the point. Say what you left out in one sentence after the sketch.
3. **Pick one real path** through the code, the one the user asked about or the main one, and follow it: each insert, update and delete, in the order the code makes them. Leave failure paths for another sketch.
4. **Write 5 to 10 steps.** A title says what happened, in the reader's words: "Ana uploads a video", not "POST /uploads". Writes made in one transaction or one request usually make one step. A step may have no changes when it explains a moment worth seeing, but keep that rare.
5. **Explain only what the rows don't show:** a transaction boundary, a row rewritten in place rather than replaced, a write that happens later in a background job, why a column you might expect is missing. Keep each explanation to a sentence or two. Never put a change only in an explanation.
6. **Use realistic values.** Short ids, a letter for the table and a number. States from the code's enums, real MIME types, plausible names and amounts.
7. **Check.** If the `skeudo` command is installed, run `skeudo check doc.md` and fix every warning: unknown tables or columns, ids used twice, rows changed before they exist, references to rows that don't exist at that step. Then read each step against the code once more.

## Output

As for code sketches, a Markdown document: a sentence or two on what the model is for, the sketch, then "Not shown: …" and anything a reviewer should look at, such as a row that can point at a deleted one, or a state the code never leaves.

## Example

```skeudo
data
customer(name, email)
  One account. A guest gets a row too, with no email.

order(customer -> customer, state, total, payment -> payment)
  What the customer buys. The order lines aren't shown.

payment(provider, state, amount)
  One attempt to charge a card. A declined payment is kept,
  and a retry adds a new row.

shipment(order -> order, carrier, tracking)

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
